# ═══════════════════════════════════════════════════════════════════════════
# libvips 8.18.7 (+ correctifs wasm-vips) SUR UN SEUL THREAD — essai D, 02/11
# ═══════════════════════════════════════════════════════════════════════════
# Les fonctions Supabase n'ont pas de Web Workers : une compilation Emscripten
# SANS -pthread n'a qu'un thread. libvips, lui, confie son travail à des
# threads (threadpool) et écrit en arrière-plan (vips_sink_disc). Ce correctif,
# actif seulement sous Emscripten sans pthreads, garde EXACTEMENT les mêmes
# calculs et le même ordre des tuiles, mais :
#   1. vips_thread_execute exécute la tâche sur place (un seul « ouvrier » qui
#      traite toutes les tuiles, comme avec VIPS_CONCURRENCY=1) ;
#   2. l'écriture différée de vips_sink_disc devient immédiate, au moment où le
#      tampon serait confié au thread d'écriture (même tampon, même ordre) ;
#   3. une attente qui ne pourrait jamais se terminer (personne d'autre pour
#      réveiller) arrête net avec une erreur, au lieu de boucler sans fin.
# Usage : python patch-mono.py <dossier des sources de libvips>
import pathlib
import sys

racine = pathlib.Path(sys.argv[1]) / "libvips"
MONO = "#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)"


def remplacer(fichier, avant, apres):
    p = racine / fichier
    s = p.read_text(encoding="utf-8")
    n = s.count(avant)
    if n != 1:
        sys.exit(f"ÉCHEC {fichier} : {n} occurrence(s) au lieu d'une")
    p.write_text(s.replace(avant, apres), encoding="utf-8")
    print(f"ok {fichier}")


# 1. Une tâche « dans un thread » s'exécute sur place.
remplacer("iofuncs/threadpool.c",
"""int
vips_thread_execute(const char *domain, GFunc func, gpointer data)
{
	return vips_threadset_run(vips__threadset, domain, func, data);
}""",
f"""int
vips_thread_execute(const char *domain, GFunc func, gpointer data)
{{
{MONO}
	/* Un seul thread : la tâche s'exécute ici, tout de suite. Pas de
	 * vips_thread_shutdown() : les tampons appartiennent au thread unique.
	 */
	(void) domain;
	func(data, NULL);
	return 0;
#else
	return vips_threadset_run(vips__threadset, domain, func, data);
#endif
}}""")

# 3. Attendre un autre thread est impossible : erreur nette plutôt qu'une boucle sans fin.
remplacer("iofuncs/threadpool.c",
"""	if (worker)
		g_atomic_int_inc(&worker->pool->n_waiting);
	g_cond_wait(cond, mutex);""",
f"""{MONO}
	(void) worker;
	g_error("libvips (un seul thread) : attente d'un autre thread impossible");
#endif
	if (worker)
		g_atomic_int_inc(&worker->pool->n_waiting);
	g_cond_wait(cond, mutex);""")

# 2a. Pas de thread d'écriture en arrière-plan.
remplacer("iofuncs/sinkdisc.c",
"""	/* Make this last (picks up parts of wbuffer on startup).
	 */
	if (vips_thread_execute("wbuffer", wbuffer_write_thread, wbuffer)) {
		wbuffer_free(wbuffer);
		return NULL;
	}

	wbuffer->running = TRUE;""",
f"""{MONO}
	/* Un seul thread : wbuffer_flush() écrit lui-même (voir plus bas). */
	(void) wbuffer_write_thread;
#else
	/* Make this last (picks up parts of wbuffer on startup).
	 */
	if (vips_thread_execute("wbuffer", wbuffer_write_thread, wbuffer)) {{
		wbuffer_free(wbuffer);
		return NULL;
	}}

	wbuffer->running = TRUE;
#endif""")

# 2b. Le tampon est écrit au moment où il serait confié au thread d'écriture.
remplacer("iofuncs/sinkdisc.c",
"""	/* Set the background writer going for this buffer.
	 */
	vips_semaphore_up(&write->buf->go);

	return 0;""",
f"""{MONO}
	/* Un seul thread : la tuile précédente est déjà calculée (l'unique
	 * ouvrier alloue puis calcule, tuile après tuile) ; on écrit tout de
	 * suite, exactement ce que le thread d'écriture aurait écrit.
	 */
	vips_semaphore_downn(&write->buf->nwrite, 0);
	wbuffer_write(write->buf);
	vips_semaphore_up(&write->buf->done);
#else
	/* Set the background writer going for this buffer.
	 */
	vips_semaphore_up(&write->buf->go);
#endif

	return 0;""")
