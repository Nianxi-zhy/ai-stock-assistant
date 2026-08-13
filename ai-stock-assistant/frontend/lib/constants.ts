export const AGENT_ICONS: Record<string, string> = { news: "📰", technical: "📊", risk: "⚠️" };

export const SIGNAL_CLASSES: Record<string, string> = {
  "利好": "text-green-600", "偏利好": "text-green-600",
  "看涨": "text-green-600", "偏看涨": "text-green-600",
  "低风险": "text-green-600", "偏低风险": "text-green-600",
  "中性": "text-blue-600", "震荡": "text-blue-600",
  "中等风险": "text-blue-600",
  "偏利空": "text-orange-600", "偏看跌": "text-orange-600",
  "偏高风险": "text-orange-600",
  "利空": "text-red-600", "看跌": "text-red-600", "高风险": "text-red-600",
};

export function getSignalClass(signal: string): string {
  return SIGNAL_CLASSES[signal] || "text-gray-600";
}
