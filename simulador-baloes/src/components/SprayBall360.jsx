'use client';

// Spray ball 360° da lavagem CIP: cano de inox no topo, bola com furinhos,
// 20 filetes pontilhados em 360° batendo na parede interna + trilhas + "EM CIP".
// O balão fica VAZIO durante a lavagem (só água nas paredes, sem enchimento).
const JETS = 20;

const SprayBall360 = () => (
  <div className="spray360" aria-hidden="true">
    {/* Escurece o interior p/ os jatos brancos saltarem aos olhos */}
    <div className="spray-tint" />
    {/* Névoa atrás da bola */}
    <div className="spray-mist" />
    {/* Cano de inox vindo do topo */}
    <div className="spray-pipe" />

    {/* Jatos em 360° (grupo gira devagar, cada jato pisca) */}
    <div className="spray-jets">
      {Array.from({ length: JETS }).map((_, i) => (
        <div
          key={i}
          className="spray-jet"
          style={{
            transform: `rotate(${i * 18}deg)`,
            animationDelay: `${(i % 5) * 0.18}s`,
          }}
        />
      ))}
    </div>

    {/* Bola com furinhos (gira devagar) */}
    <div className="spray-ball" />

    {/* Lençóis de água batendo e escorrendo pelas paredes */}
    <div className="spray-sheet spray-sheet-l" />
    <div className="spray-sheet spray-sheet-r" />
    {/* Trilhas de água escorrendo pela parede interna */}
    <div className="spray-drip spray-drip-l1" />
    <div className="spray-drip spray-drip-l2" />
    <div className="spray-drip spray-drip-r1" />
    <div className="spray-drip spray-drip-r2" />

    {/* Texto central com opacidade baixa */}
    <div className="spray-emcip">
      <span>EM CIP</span>
    </div>
  </div>
);

export default SprayBall360;