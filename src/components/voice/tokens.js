// Tokens et animations du drawer vocal — séparés des composants pour que
// VoiceKit.jsx n'exporte que des composants (react-refresh/only-export-components).
// AUCUN token nouveau : ce sont ceux de src/components/ui.jsx, recopiés ici pour
// éviter une dépendance croisée entre le kit vocal et l'UI générale.

export const V = {
  canvas:   '#EDEAE0',
  paper:    '#F6F5F1',
  ink:      '#10201B',
  teal:     '#2F9E90',
  tealDeep: '#1B6E62',
  amber:    '#E8956D',
  amberInk: '#C46A3E',
  mute:     '#8A8578',
  mute2:    '#6B7A75',
  border:   '#E7E3D8',
  card:     '#FFFFFF',
  chip:     '#F2F0E9',
  negative: '#B0645A',
  tealSoft: 'rgba(47,158,144,0.12)',
  amberSoft:'rgba(232,149,109,0.16)',
};

export const VOICE_KIT_CSS = `
@keyframes vk-slidein{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes vk-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes vk-pulse{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.9);opacity:0}}
@keyframes vk-wave{0%,100%{transform:scaleY(.45)}50%{transform:scaleY(1)}}
@keyframes vk-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.vk-card{animation:vk-fadein .25s ease}
.vk-input{font-family:inherit;font-size:15px;font-weight:600;color:${V.ink};background:none;border:none;outline:none;width:100%;min-width:0}
.vk-input::placeholder{color:${V.mute};font-weight:500}
.vk-select{font-family:inherit;font-size:14px;font-weight:600;color:${V.ink};background:none;border:none;outline:none;width:100%;min-width:0}
.vk-tap:active{filter:brightness(0.96)}
@media (prefers-reduced-motion:reduce){
  .vk-card,.vk-ring,.vk-wave i,.vk-skel i{animation:none !important}
}
`;
