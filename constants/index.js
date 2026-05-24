export const CURRENCY = "ج.م";
export const CLIENT_EXPENSE_CATS = ["قماش", "خشب وكلف", "مصنعية", "نقل وتركيب", "أخرى"];
export const GENERAL_EXPENSE_CATS = ["إيجار", "أجور عمال", "كهرباء وماء", "مصروفات شخصية", "أخرى"];
export const GENERAL_INCOME_CATS = ['بيع ستاير', 'بيع أوضة نوم', 'بيع مطبخ', 'بيع ريسبشن', 'بيع موبيليا كاملة', 'أخرى'];
export const PROJECT_TYPES = ["ستاير", "أوضة نوم", "مطبخ", "ريسبشن", "موبيليا كاملة", "أخرى"];
export const STATUS_LABELS = {
  active: { label: "جاري", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  done: { label: "منتهي", color: "#10b981", bg: "rgba(16,185,129,0.15)" },
};
export const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export const STOCK_UNITS = [
  { id: "count", label: "عدد" },
  { id: "length", label: "متر طول" },
  { id: "area", label: "متر مربع" },
  { id: "volume", label: "متر مكعب" },
  { id: "weight", label: "كجم" },
];

export const DEFAULT_STOCK_ITEMS = [
  { name: "قماش", unit: "length", expenseCat: "قماش" },
  { name: "اسفنج", unit: "count", expenseCat: "أخرى" },
  { name: "خشب", unit: "length", expenseCat: "خشب وكلف" },
  { name: "كلف", unit: "area", expenseCat: "خشب وكلف" },
  { name: "غراء / لزق", unit: "count", expenseCat: "أخرى" },
  { name: "مسامير وإكسسوار", unit: "count", expenseCat: "أخرى" },
];

export const NAV_ITEMS = [
  ["dashboard", "📊", "الرئيسية"],
  ["clients", "👥", "العملاء"],
  ["warehouse", "📦", "المخزن"],
  ["workers", "👷", "الصنايعية"],
  ["suppliers", "🏭", "الموردين"],
  ["general", "🏢", "مصروفات عامة"],
  ["generalIncome", "💵", "دخل عام"],
  ["zakat", "🌙", "الزكاة"],
  ["fiscalyear", "📅", "السنة المالية"],
  ["backups", "☁️", "نسخ Google Drive"],
];
