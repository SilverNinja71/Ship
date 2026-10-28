// Inline SVG for the gate: a cartoon siren in a pirate hat, singing on a rock
// under the moon. Static markup only; nothing from the page goes in here.

export const SIREN_SVG = `
<svg viewBox="0 0 200 200" role="img" aria-label="A cartoon siren in a pirate hat, singing on a rock" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="lk-frame"><rect width="200" height="200" rx="30"/></clipPath>
    <clipPath id="lk-shirt"><path d="M83 104 C83 95 91 91 100 91 C109 91 117 95 117 104 L119 134 L81 134 Z"/></clipPath>
    <linearGradient id="lk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D2D52"/><stop offset="1" stop-color="#31507A"/></linearGradient>
  </defs>
  <g clip-path="url(#lk-frame)">
    <rect width="200" height="200" fill="url(#lk-sky)"/>
    <circle cx="156" cy="40" r="15" fill="#FBF3E4"/>
    <circle cx="163" cy="35" r="13" fill="#21335A"/>
    <g fill="#FBF3E4" opacity=".75"><circle cx="30" cy="30" r="1.8"/><circle cx="58" cy="54" r="1.3"/><circle cx="118" cy="22" r="1.6"/><circle cx="182" cy="82" r="1.3"/><circle cx="20" cy="96" r="1.2"/></g>
    <g class="lk-notes" fill="#E8C770">
      <ellipse cx="143" cy="96" rx="5.5" ry="4.2" transform="rotate(-20 143 96)"/><rect x="146.6" y="74" width="2.6" height="22" rx="1"/><path d="M149 74 q9 3 8 12 q-2-6-8-7z"/>
      <ellipse cx="166" cy="72" rx="4.4" ry="3.4" transform="rotate(-20 166 72)"/><rect x="169" y="55" width="2.2" height="17" rx="1"/><path d="M171 55 q7 2 6 9 q-2-4-6-5z"/>
    </g>
    <path d="M30 172 C36 140 76 128 104 132 C134 128 164 142 172 172 Z" fill="#5E6478"/>
    <path d="M58 146 C70 137 90 134 104 136" stroke="#7E8499" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M97 128 C93 147 113 157 137 151 C151 147 157 139 161 131" stroke="#2FA38A" stroke-width="17" fill="none" stroke-linecap="round"/>
    <path d="M108 146 q5 -4 10 0 M124 148 q5 -4 10 0 M140 143 q4 -4 9 -1" stroke="#9FE3CF" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>
    <path d="M158 133 C159 117 171 110 181 112 C175 120 172 126 167 134 C177 134 185 142 187 151 C177 149 166 143 158 137 Z" fill="#3FB59A"/>
    <path d="M73 80 C68 54 87 42 100 42 C119 42 134 56 129 81 C133 101 131 121 121 131 L79 131 C69 119 69 99 73 80 Z" fill="#E2604F"/>
    <path d="M83 104 C83 95 91 91 100 91 C109 91 117 95 117 104 L119 134 L81 134 Z" fill="#FBF3E4"/>
    <g clip-path="url(#lk-shirt)" stroke="#1B2A4A" stroke-width="4"><path d="M76 108 H124 M76 117 H124 M76 126 H124"/></g>
    <path d="M86 104 C78 112 76 122 80 130" stroke="#F2C59B" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M114 103 C124 99 130 92 132 85" stroke="#F2C59B" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M125 83 C127 70 140 65 147 71 C148 80 139 89 128 89 Z" fill="#F6D7A7" stroke="#C9A04E" stroke-width="2"/>
    <path d="M131 85 L141 72 M128 84 L136 70" stroke="#C9A04E" stroke-width="1.5"/>
    <circle cx="100" cy="72" r="20" fill="#F2C59B"/>
    <path d="M80 71 C82 57 94 50 104 52 C113 54 119 60 121 69 C113 63 101 62 93 64 C88 66 84 68 80 71 Z" fill="#E2604F"/>
    <ellipse cx="93" cy="74" rx="2.5" ry="3.1" fill="#1B2A4A"/><ellipse cx="107" cy="74" rx="2.5" ry="3.1" fill="#1B2A4A"/>
    <circle cx="94" cy="73" r=".9" fill="#fff"/><circle cx="108" cy="73" r=".9" fill="#fff"/>
    <circle cx="87.5" cy="80" r="3.4" fill="#E2604F" opacity=".35"/><circle cx="112.5" cy="80" r="3.4" fill="#E2604F" opacity=".35"/>
    <ellipse cx="100" cy="84.5" rx="3.3" ry="2.8" fill="#B5473B"/>
    <path d="M73 57 C84 50 92 53 100 46 C108 53 116 50 127 57 C121 44 112 33 100 33 C88 33 79 44 73 57 Z" fill="#1B2A4A"/>
    <path d="M73 57 C84 50 92 53 100 46 C108 53 116 50 127 57" stroke="#C9A04E" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="100" cy="40" r="3.4" fill="#C9A04E"/>
    <path d="M0 166 C20 158 36 174 56 166 S92 158 112 166 S148 174 168 166 S196 160 200 164 L200 200 L0 200 Z" fill="#2C8C77"/>
    <path d="M0 178 C22 170 40 186 62 178 S100 170 122 178 S160 186 182 178 S200 174 200 174 L200 200 L0 200 Z" fill="#3FB59A"/>
    <g fill="#DDF3EC" opacity=".8"><circle cx="40" cy="182" r="1.8"/><circle cx="96" cy="188" r="1.5"/><circle cx="150" cy="184" r="1.8"/></g>
  </g>
</svg>`;

export const CARDS_ICON = `<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="9" y="5" width="18" height="24" rx="3" fill="#F3E8D2" stroke="#C9A04E" stroke-width="2" transform="rotate(12 18 17)"/><rect x="6" y="6" width="18" height="24" rx="3" fill="#FFFDF7" stroke="#1B2A4A" stroke-width="2"/><path d="M10 13h10M10 18h7" stroke="#3FB59A" stroke-width="2.4" stroke-linecap="round"/></svg>`;

export const WHEEL_ICON = `<svg viewBox="0 0 34 34" aria-hidden="true"><g stroke="#E8C770" stroke-width="2.4" stroke-linecap="round" fill="none"><circle cx="17" cy="17" r="8.5"/><path d="M17 3v28M3 17h28M7.1 7.1l19.8 19.8M26.9 7.1L7.1 26.9"/></g><circle cx="17" cy="17" r="3.4" fill="#E8C770"/></svg>`;

export const SPYGLASS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-30 12 12)"><rect x="2" y="9.5" width="7" height="5" rx="1" fill="#C9A04E"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.2" fill="#E8C770"/><rect x="15" y="7.5" width="7" height="9" rx="1.5" fill="#C9A04E"/></g></svg>`;
