// Styles for the gate's shadow root. Sizes are in px, not rem: rem follows
// the host page's root font size, which the shadow boundary doesn't stop.

const FONT = `ui-rounded, "SF Pro Rounded", Nunito, "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;

export const GATE_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.backdrop {
  position: absolute; inset: 0; display: flex; padding: 16px; overflow-y: auto;
  background: radial-gradient(ellipse at 50% 115%, rgba(63, 181, 154, 0.35), transparent 60%), rgba(12, 21, 40, 0.9);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  font-family: ${FONT}; font-size: 15px; line-height: 1.45; color: #1B2A4A; text-align: left;
}
.card {
  position: relative; width: min(660px, 100%); margin: auto; padding: 22px;
  background: #FBF3E4; border: 3px solid #C9A04E; border-radius: 24px;
  box-shadow: 0 0 0 6px rgba(251, 243, 228, 0.12), 0 24px 60px rgba(0, 0, 0, 0.45);
  display: grid; grid-template-columns: 150px 1fr; gap: 4px 20px;
}
.art svg { display: block; width: 150px; height: 150px; }
.lk-notes { animation: lk-float 3.6s ease-in-out infinite; transform-origin: center; }
@keyframes lk-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.kicker { margin: 4px 0 0; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #8A6A2B; }
h1 { margin: 2px 0 6px; font-size: 26px; line-height: 1.15; font-weight: 800; color: #1B2A4A; }
.reason { margin: 0 0 10px; font-size: 15px; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 10px; background: #EFE3CB; color: #5B4A2A; border: 1px solid #DCC9A2; }
.chip.gemini, .chip.cache { background: #DDF3EC; color: #1E6B58; border-color: #A8DCCB; }
.chip.heuristic { background: #FFF1D6; color: #8A5A00; border-color: #E9C987; }
.chip.always-blocked { background: #FBE1DD; color: #A33A2C; border-color: #F0B3AA; }
.voyage { grid-column: 1 / -1; margin: 10px 0 0; padding: 8px 12px; border-radius: 12px; background: #F3E8D2; font-size: 13.5px; color: #3A4866; overflow-wrap: anywhere; }
.panel { grid-column: 1 / -1; margin-top: 14px; }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.choice {
  appearance: none; font: inherit; text-align: left; cursor: pointer; border-radius: 16px; padding: 14px 16px;
  border: 2px solid; display: flex; gap: 12px; align-items: flex-start; transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.choice:hover:not([disabled]) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(27, 42, 74, 0.2); }
.choice[disabled] { cursor: progress; opacity: 0.7; }
.choice.quiz { background: #FFFDF7; border-color: #C9A04E; color: #1B2A4A; }
.choice.steer { background: #1B2A4A; border-color: #1B2A4A; color: #FBF3E4; }
.choice .icon { flex: none; width: 34px; height: 34px; }
.choice .icon svg { width: 34px; height: 34px; display: block; }
.choice strong { display: block; font-size: 16px; line-height: 1.25; }
.choice .sub { display: block; font-size: 13px; opacity: 0.85; margin-top: 3px; }
.choice.steer .sub { color: #E8C770; opacity: 1; font-weight: 700; }
button:focus-visible, input:focus-visible { outline: 3px solid #3FB59A; outline-offset: 2px; }
.note { border: 2px dashed #C9A04E; border-radius: 16px; padding: 12px 14px; background: #FFFDF7; font-size: 13.5px; }
.note strong { display: block; font-size: 15px; margin-bottom: 2px; }
.quizhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #5B4A2A; }
.pips { display: inline-flex; gap: 5px; margin-left: 8px; vertical-align: -2px; }
.pip { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #C9A04E; background: #FFFDF7; }
.pip.on { background: #3FB59A; border-color: #2C8C77; }
.front { background: #FFFDF7; border: 2px solid #E4D3AE; border-radius: 16px; padding: 14px 16px; font-size: 18px; font-weight: 700; min-height: 60px; white-space: pre-wrap; overflow-wrap: anywhere; }
.front small { display: block; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #8A6A2B; margin-bottom: 4px; }
form { display: flex; gap: 8px; margin: 10px 0 0; }
label.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
input[type="text"] {
  flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 10px 12px; border-radius: 12px;
  border: 2px solid #C9A04E; background: #FFFFFF; color: #1B2A4A;
}
input[type="text"][disabled] { background: #F3E8D2; }
.btn { appearance: none; font: inherit; font-weight: 800; cursor: pointer; border-radius: 12px; padding: 10px 16px; border: 2px solid #1B2A4A; background: #1B2A4A; color: #FBF3E4; }
.btn.ghost { background: transparent; color: #1B2A4A; }
.btn.seafoam { background: #3FB59A; border-color: #2C8C77; color: #0E2A23; }
.linkbtn { appearance: none; background: none; border: none; font: inherit; font-size: 13px; color: #2E5E8B; text-decoration: underline; cursor: pointer; padding: 2px 4px; }
.feedback { min-height: 22px; margin-top: 10px; font-size: 14px; }
.feedback.good { color: #1E6B58; font-weight: 700; }
.feedback.bad { color: #A33A2C; }
.answer { display: block; margin-top: 4px; padding: 8px 12px; border-radius: 10px; background: #FBE1DD; color: #7A2A20; font-weight: 700; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.done { text-align: center; padding: 10px 6px; border-radius: 16px; background: #DDF3EC; color: #1E4D42; }
.done.steered { background: #1B2A4A; color: #FBF3E4; }
.done strong { display: block; font-size: 18px; margin-bottom: 2px; }
.done .gold { color: #E8C770; }
.foot { grid-column: 1 / -1; margin: 14px 0 0; font-size: 12px; color: #7A6A4E; text-align: center; }
@media (max-width: 600px) {
  .card { grid-template-columns: 1fr; text-align: center; padding: 18px; }
  .art { justify-self: center; }
  .art svg { width: 120px; height: 120px; }
  .chips { justify-content: center; }
  .choices { grid-template-columns: 1fr; }
  .choice, .front, .feedback, .quizhead { text-align: left; }
  h1 { font-size: 22px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

.toast {
  position: fixed; right: 16px; bottom: 16px; max-width: min(380px, calc(100vw - 32px)); display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 999px; background: #1B2A4A; color: #FBF3E4; border: 2px solid #C9A04E;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35); font-family: ${FONT}; font-size: 13.5px; line-height: 1.35;
}
.toast svg { width: 22px; height: 22px; flex: none; }
.toast.ok { border-color: #3FB59A; }
.toast small { display: block; opacity: 0.75; font-size: 11.5px; }
`;
