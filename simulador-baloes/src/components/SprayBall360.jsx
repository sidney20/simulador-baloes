'use client';

// Lavagem CIP — equipamento sanitário real (SOMENTE VISUAL).
// Tubo de alimentação com flanges, cabeça rotativa de limpeza com jatos
// naturais, lâminas escorrendo nas paredes e dreno no fundo.
// Nenhuma lógica, cálculo ou comportamento é alterado por este componente.
const JETS = 12;

const SprayBall360 = () => (
  <div className="spray360" aria-hidden="true">
    {/* Sombra neutra do interior */}
    <div className="spray-tint" />

    {/* Tubo de alimentação em inox */}
    <div className="spray-pipe">
      <div className="cip-pipeflow" />
    </div>
    {/* Flanges sanitárias (tri-clamp) na entrada do tanque */}
    <div className="cip-flange cip-flange-f1" />
    <div className="cip-flange cip-flange-f2" />

    {/* Jatos naturais da cabeça rotativa (girando devagar) */}
    <div className="spray-jets">
      {Array.from({ length: JETS }).map((_, i) => (
        <div
          key={i}
          className="spray-jet"
          style={{ transform: `rotate(${i * 30}deg)` }}
        />
      ))}
    </div>

    {/* Anel de bocais + cabeça de limpeza em inox */}
    <div className="cip-rotor" />
    <div className="spray-ball" />

    {/* Lâminas de água escorrendo pelas paredes */}
    <div className="spray-sheet spray-sheet-l" />
    <div className="spray-sheet spray-sheet-r" />
    {/* Trilhas de água escorrendo pela parede interna */}
    <div className="spray-drip spray-drip-l1" />
    <div className="spray-drip spray-drip-l2" />
    <div className="spray-drip spray-drip-r1" />
    <div className="spray-drip spray-drip-r2" />

    {/* Ralo de drenagem + saída */}
    <div className="cip-drain" />
    <div className="cip-drainflow" />
    <div className="cip-drop" />
    <div className="cip-drop cip-drop-d2" />

    {/* Texto com opacidade baixa */}
    <div className="spray-emcip">
      <span>EM CIP</span>
    </div>
  </div>
);

export default SprayBall360;