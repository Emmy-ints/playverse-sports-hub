import type { AvatarConfig } from "@/lib/avatar";

/** Stylized 2D character preview (SVG). The 3D viewer replaces this in a later milestone. */
export function AvatarPreview({ config, headOnly = false }: { config: AvatarConfig; headOnly?: boolean }) {
  const c = config;
  const shoulder = c.genderPresentation === "masculine" ? 46 : c.genderPresentation === "feminine" ? 36 : 41;
  const waist = c.genderPresentation === "feminine" ? 26 : 32;
  const view = headOnly ? "62 18 76 76" : "0 0 200 320";
  const dark = "#10131c";

  const hair = () => {
    const f = c.hairColor;
    switch (c.hairstyle) {
      case "buzz": return <path d="M74 52 Q100 22 126 52 L126 46 Q100 26 74 46Z" fill={f} />;
      case "short": return <path d="M72 58 Q70 26 100 26 Q130 26 128 58 Q122 40 100 40 Q80 40 72 58Z" fill={f} />;
      case "curly": return <g fill={f}>{[74, 84, 94, 106, 116, 126].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 34 : 40} r={11} />)}</g>;
      case "long": return <path d="M70 60 Q68 24 100 24 Q132 24 130 60 L134 112 Q124 96 124 70 Q100 40 76 70 Q76 96 66 112Z" fill={f} />;
      case "ponytail": return <g fill={f}><path d="M72 58 Q70 26 100 26 Q130 26 128 58 Q120 40 100 40 Q80 40 72 58Z" /><path d="M126 44 Q150 60 138 100 Q134 74 122 56Z" /></g>;
      case "mohawk": return <path d="M92 44 L96 14 L104 14 L108 44Z" fill={f} />;
    }
  };
  const face = () => {
    const brow = c.face === "fierce" ? <g stroke={dark} strokeWidth={3} strokeLinecap="round"><path d="M84 56 L94 60" /><path d="M116 56 L106 60" /></g> : null;
    const mouth = c.face === "smile" ? <path d="M90 76 Q100 86 110 76" stroke={dark} strokeWidth={3} fill="none" strokeLinecap="round" /> : c.face === "fierce" ? <path d="M91 79 L109 79" stroke={dark} strokeWidth={3} strokeLinecap="round" /> : <path d="M92 78 Q100 81 108 78" stroke={dark} strokeWidth={3} fill="none" strokeLinecap="round" />;
    return <g>{brow}<circle cx={89} cy={65} r={3.5} fill={dark} /><circle cx={111} cy={65} r={3.5} fill={dark} />{mouth}</g>;
  };
  const accessory = () => {
    switch (c.accessory) {
      case "cap": return <g fill={c.outfitColor}><path d="M70 50 Q70 22 100 22 Q130 22 130 50Z" /><rect x={96} y={44} width={48} height={8} rx={4} /></g>;
      case "headband": return <rect x={71} y={44} width={58} height={8} rx={3} fill={c.outfitColor} />;
      case "glasses": return <g stroke={dark} strokeWidth={3} fill="none"><circle cx={89} cy={65} r={8} /><circle cx={111} cy={65} r={8} /><path d="M97 65 L103 65" /></g>;
      default: return null;
    }
  };
  const top = () => {
    const col = c.outfitColor;
    const trim = c.outfit === "polo" ? <path d="M92 104 L100 118 L108 104" stroke="#ffffff" strokeWidth={3} fill="none" /> : c.outfit === "track" ? <g stroke="#ffffff" strokeWidth={3}><path d={`M${100 - shoulder + 6} 112 L${100 - waist + 2} 190`} /><path d={`M${100 + shoulder - 6} 112 L${100 + waist - 2} 190`} /></g> : c.outfit === "tennis" ? <path d={`M${100 - waist} 172 L${100 + waist} 172`} stroke="#ffffff" strokeWidth={4} /> : <text x={100} y={160} textAnchor="middle" fontSize={30} fontWeight={900} fill="#ffffff" opacity={0.9} fontFamily="Saira Condensed, sans-serif">1</text>;
    return <g><path d={`M${100 - shoulder} 112 Q100 98 ${100 + shoulder} 112 L${100 + waist} 192 L${100 - waist} 192Z`} fill={col} />{trim}</g>;
  };

  return (
    <svg viewBox={view} role="img" aria-label={`Preview of ${c.nickname}`} className="h-full w-full">
      {!headOnly && (
        <g>
          <ellipse cx={100} cy={308} rx={56} ry={8} fill="#000000" opacity={0.35} />
          {/* arms */}
          <rect x={100 - shoulder - 12} y={110} width={14} height={78} rx={7} fill={c.skinTone} />
          <rect x={100 + shoulder - 2} y={110} width={14} height={78} rx={7} fill={c.skinTone} />
          {c.accessory === "wristbands" && <g fill={c.outfitColor}><rect x={100 - shoulder - 13} y={168} width={16} height={10} rx={3} /><rect x={100 + shoulder - 3} y={168} width={16} height={10} rx={3} /></g>}
          {/* legs */}
          <rect x={100 - waist + 4} y={186} width={24} height={98} rx={10} fill={dark} />
          <rect x={100 + waist - 28} y={186} width={24} height={98} rx={10} fill={dark} />
          {/* shoes */}
          <g fill={c.shoeColor}>
            <path d={`M${100 - waist} ${c.shoes === "high-top" ? 270 : 282} h30 v12 q0 8 -8 8 h-30 q-4 0 -4 -6Z`} />
            <path d={`M${100 + waist - 30} ${c.shoes === "high-top" ? 270 : 282} h30 v20 h-30 q-6 0 -6 -6 v-6Z`} />
          </g>
          {c.shoes === "court" && <path d={`M${100 - waist - 8} 300 h38 M${100 + waist - 32} 300 h38`} stroke="#ffffff" strokeWidth={3} />}
          {top()}
          <rect x={92} y={86} width={16} height={18} fill={c.skinTone} />
        </g>
      )}
      {c.hairstyle === "long" && hair()}
      <ellipse cx={100} cy={60} rx={28} ry={32} fill={c.skinTone} />
      {face()}
      {c.hairstyle !== "long" && c.accessory !== "cap" && hair()}
      {accessory()}
    </svg>
  );
}
