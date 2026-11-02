/* ═══════════════════════════════════════════════════════════════════════════
 * ESSAI D, UN SEUL THREAD — la transformation Supabase (imgproxy : fit
 * 400×400, sans agrandissement, quality 80) refaite par libvips 8.18.7.
 * Mêmes appels, mêmes options, même ordre que scripts/reproduire.ts (essai D,
 * 200/200 empreintes identiques avec wasm-vips 0.0.19) :
 *   chargement (JPEG : réduction ×2/×4/×8 au décodage) → resize lanczos3 →
 *   profil ICC → sRGB APRÈS la réduction → métadonnées retirées →
 *   JPEG Q80 progressif / PNG filter all.
 * Périmètre PROUVÉ seulement : JPEG ou PNG, 3 bandes 8 bits sRGB, orientation
 * EXIF 1. Le reste rend ESSAI_HORS_PERIMETRE : il reste à Supabase.
 * ═══════════════════════════════════════════════════════════════════════════ */
#include <emscripten.h>
#include <math.h>
#include <string.h>
#include <vips/vips.h>

#define ESSAI_OK 0
#define ESSAI_HORS_PERIMETRE 1
#define ESSAI_ERREUR -1

static int pret = 0;

/* infos[] rendues à l'appelant (dans cet ordre) */
enum { I_LARGEUR, I_HAUTEUR, I_BANDES, I_ORIENTATION, I_PNG, I_REDUCTION_JPEG, I_RESIZE, I_ICC, I_N };

EMSCRIPTEN_KEEPALIVE int
essai_init(void)
{
	if (pret)
		return 0;
	if (VIPS_INIT("essai-d"))
		return -1;
	vips_concurrency_set(1);
	/* Le cache d'opérations ne change aucun pixel : coupé, il ne garde aucune image en vie. */
	vips_cache_set_max(0);
	pret = 1;
	return 0;
}

EMSCRIPTEN_KEEPALIVE const char *
essai_erreur(void)
{
	return vips_error_buffer();
}

EMSCRIPTEN_KEEPALIVE void
essai_liberer(void *p)
{
	g_free(p);
}

/* La mémoire suivie par libvips (pixels) : pointe depuis le démarrage, en octets. */
EMSCRIPTEN_KEEPALIVE double
essai_pointe_libvips(void)
{
	return (double) vips_tracked_get_mem_highwater();
}

static int
champ_a_retirer(const char *nom)
{
	return g_str_has_prefix(nom, "exif-") ||
		g_str_has_prefix(nom, "xmp-data") ||
		g_str_has_prefix(nom, "iptc-data") ||
		g_str_has_prefix(nom, "icc-profile-data") ||
		g_str_has_prefix(nom, "orientation");
}

EMSCRIPTEN_KEEPALIVE int
essai_reduire(const void *buf, size_t len, void **sortie, size_t *sortie_len, int *infos)
{
	VipsImage *tete = NULL, *charge = NULL, *reduite = NULL, *srgb = NULL, *copie = NULL;
	VipsImage *im;
	const char *chargeur = NULL;
	int orientation = 1;
	int png, resultat = ESSAI_ERREUR;
	double s, wscale, hscale, pre;
	int js = 1;

	*sortie = NULL;
	*sortie_len = 0;
	memset(infos, 0, I_N * sizeof(int));
	vips_error_clear();

	if (!(tete = vips_image_new_from_buffer(buf, len, "", NULL)))
		goto fin;
	if (vips_image_get_string(tete, "vips-loader", &chargeur))
		goto fin;
	if (vips_image_get_typeof(tete, VIPS_META_ORIENTATION) &&
		vips_image_get_int(tete, VIPS_META_ORIENTATION, &orientation))
		goto fin;
	png = g_str_has_prefix(chargeur, "pngload");
	infos[I_LARGEUR] = tete->Xsize;
	infos[I_HAUTEUR] = tete->Ysize;
	infos[I_BANDES] = tete->Bands;
	infos[I_ORIENTATION] = orientation;
	infos[I_PNG] = png;

	if (!(png || g_str_has_prefix(chargeur, "jpegload")) ||
		tete->Bands != 3 ||
		tete->BandFmt != VIPS_FORMAT_UCHAR ||
		tete->Type != VIPS_INTERPRETATION_sRGB ||
		orientation != 1) {
		resultat = ESSAI_HORS_PERIMETRE;
		goto fin;
	}

	/* fit : la plus forte des deux réductions, jamais d'agrandissement */
	s = 1.0 / VIPS_MAX((double) tete->Xsize / 400.0, (double) tete->Ysize / 400.0);
	if (s > 1)
		s = 1;
	wscale = hscale = s;
	im = tete;

	/* réduction au décodage JPEG (×2, ×4, ×8), échelles recalculées sur la taille chargée */
	pre = VIPS_MIN((double) tete->Xsize / round(tete->Xsize * s),
		(double) tete->Ysize / round(tete->Ysize * s));
	if (pre > 1 && !png) {
		js = pre >= 8 ? 8 : pre >= 4 ? 4 : pre >= 2 ? 2 : 1;
		if (js > 1) {
			if (!(charge = vips_image_new_from_buffer(buf, len, "", "shrink", js, NULL)))
				goto fin;
			im = charge;
			wscale = ((double) tete->Xsize / im->Xsize) * s;
			hscale = ((double) tete->Ysize / im->Ysize) * s;
		}
	}
	infos[I_REDUCTION_JPEG] = js;

	if (wscale != 1 || hscale != 1) {
		if (vips_resize(im, &reduite, wscale, "vscale", hscale, NULL))
			goto fin;
		im = reduite;
		infos[I_RESIZE] = 1;
	}

	/* profil ICC intégré : converti en sRGB APRÈS la réduction */
	if (vips_image_get_typeof(im, VIPS_META_ICC_NAME)) {
		if (vips_icc_transform(im, &srgb, "srgb", "embedded", TRUE, NULL))
			goto fin;
		im = srgb;
		infos[I_ICC] = 1;
	}

	/* métadonnées : rien de l'originale ne repart (l'EXIF minimal est celui que libvips écrit) */
	if (vips_copy(im, &copie, NULL))
		goto fin;
	{
		gchar **champs = vips_image_get_fields(copie);
		for (int i = 0; champs[i]; i++)
			if (champ_a_retirer(champs[i]))
				vips_image_remove(copie, champs[i]);
		g_strfreev(champs);
	}

	if (png) {
		if (vips_image_write_to_buffer(copie, ".png", sortie, sortie_len,
				"filter", VIPS_FOREIGN_PNG_FILTER_ALL, NULL))
			goto fin;
	}
	else if (vips_image_write_to_buffer(copie, ".jpg", sortie, sortie_len,
				 "Q", 80, "interlace", TRUE, NULL))
		goto fin;

	resultat = ESSAI_OK;

fin:
	VIPS_UNREF(copie);
	VIPS_UNREF(srgb);
	VIPS_UNREF(reduite);
	VIPS_UNREF(charge);
	VIPS_UNREF(tete);
	return resultat;
}
