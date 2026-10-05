'use client';

import { motion } from 'framer-motion';
{/* import { TrendingUp, Package, AlertCircle, Clock } from 'lucide-react'; */}

const Dashboard = ({
  balloons,
  totalVolume,
  totalCapacity,
  totalFlowRate,
  emptyCount,
  runningCount,
}) => {
  const overallPercentage = totalCapacity > 0 ? (totalVolume / totalCapacity) * 100 : 0;

  const metrics = [
    {
      label: 'Volume Total',
      value: `${totalVolume.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`,
      subtitle: `${totalCapacity.toLocaleString()} L total`,
      icon: '📦',
      color: 'from-blue-500 to-cyan-500',
      progress: overallPercentage,
    },
    {
      label: 'Consumo Total/h',
      value: `${totalFlowRate.toLocaleString()} L/h`,
      subtitle: runningCount > 0 ? `${runningCount} balão(ões) ativos` : 'Nenhum balão ativo',
      icon: '⚡',
      color: 'from-orange-500 to-red-500',
      progress: Math.min(100, (totalFlowRate / 9600) * 100),
    },
    {
      label: 'Baloões Vazios',
      value: `${emptyCount} / 3`,
      subtitle: emptyCount > 0 ? 'Precisam abastecimento' : 'Todos abastecidos',
      icon: emptyCount > 0 ? '⚠️' : '✅',
      color: emptyCount > 0 ? 'from-red-500 to-orange-500' : 'from-green-500 to-emerald-500',
      progress: (emptyCount / 3) * 100,
    },
    {
      label: 'Tempo p/ Esvaziar',
      value: totalFlowRate > 0 && totalVolume > 0 
        ? `${(totalVolume / totalFlowRate).toFixed(1)} h` 
        : '--',
      subtitle: totalFlowRate > 0 ? 'Estimativa atual' : 'Simulação parada',
      icon: '⏱️',
      color: 'from-purple-500 to-pink-500',
      progress: totalFlowRate > 0 ? Math.min(100, (totalVolume / totalFlowRate) * 20) : 0,
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.label}
          className="metric-card group"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + index * 0.05 }}
        >
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center text-2xl`}>
              {metric.icon}
            </div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">{metric.label}</p>
            <p className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums break-words">{metric.value}</p>
            <p className="text-xs text-slate-500 text-center">{metric.subtitle}</p>
            
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${metric.color}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, metric.progress)}%` }}
                transition={{ duration: 1, delay: 0.3 + index * 0.1, ease: 'easeOut' }}
              />
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default Dashboard;