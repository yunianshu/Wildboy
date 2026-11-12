export type CustomerType = 'GUEST' | 'MEMBER' | 'LEADER';
export type PricingMode = 'DISCOUNT' | 'FIXED' | 'REDUCTION';
export type PricingScope = 'ACTIVITY' | 'SHOP';
export interface PricingRule { scope: PricingScope; enabled: boolean; pricingMode: PricingMode; pricingValue: number; participantPricing: 'ACCOUNT_ALL' | 'ONE_BENEFIT' | null }
export interface MembershipTier { id: string; name: string; sortOrder: number; enabled: boolean; rules: PricingRule[]; version: number }
export interface MembershipUser { id: string; nickname: string; customerType: CustomerType; tierId: string | null; tierName: string | null; tierEnabled: boolean; version: number; createdAt: string }
export const customerTypes: CustomerType[] = ['GUEST', 'MEMBER', 'LEADER'];
export const customerLabels = ['散客', '会员', '领队'];
export const participantPolicies = ['请选择多人优惠方式', '同行全部享受账号等级价', '每单最多 1 个优惠名额'];
export const modes: PricingMode[] = ['DISCOUNT', 'FIXED', 'REDUCTION'];
export const modeLabels = ['折扣', '固定价', '立减'];
export const scopes: PricingScope[] = ['ACTIVITY', 'SHOP'];
export const scopeLabels = ['活动', '商品'];
export const identityLabel = (u: MembershipUser) => customerLabels[customerTypes.indexOf(u.customerType)] || '身份待核对';
export const emptyTier = () => ({ name: '', sortOrder: '0', enabled: true, rules: scopes.map((scope, i) => ({ scope, label: scopeLabels[i], enabled: false, mode: 0, value: '10', participantPolicy: 0 })) });
export type TierForm = ReturnType<typeof emptyTier>;
export function tierForm(t: MembershipTier): TierForm { return { name: t.name, sortOrder: String(t.sortOrder), enabled: t.enabled, rules: scopes.map((scope,i) => { const r = t.rules.find(r => r.scope === scope); return { scope, label: scopeLabels[i], enabled: r?.enabled || false, participantPolicy: r?.participantPricing === 'ACCOUNT_ALL' ? 1 : r?.participantPricing === 'ONE_BENEFIT' ? 2 : 0, mode: r ? modes.indexOf(r.pricingMode) : 0, value: r ? String(r.pricingValue / (r.pricingMode === 'DISCOUNT' ? 1000 : 100)) : '10' }; }) }; }
export function tierInput(f: TierForm, version: number | null) {
  const name = f.name.trim();
  if (!name || name.length > 40) throw new Error('等级名称须为 1–40 字');
  if (!/^\d+$/.test(f.sortOrder) || Number(f.sortOrder) > 10000) throw new Error('排序须为 0–10000 的整数');
  if (version !== null && (!Number.isSafeInteger(version) || version < 0)) throw new Error('版本无效，请刷新');
  const rules = scopes.map(scope => {
    const r = f.rules.find(x => x.scope === scope);
    if (!r || !modes[r.mode]) throw new Error('请选择优惠方式');
    if (scope === 'ACTIVITY' && r.enabled && ![1,2].includes(r.participantPolicy)) throw new Error('请明确选择活动多人优惠方式');
    const discount = r.mode === 0;
    if (!(discount ? /^\d+(\.\d{1,3})?$/ : /^\d+(\.\d{1,2})?$/).test(r.value)) throw new Error(discount ? '折扣最多三位小数，如 8 表示八折' : '金额最多两位小数，单位元');
    const value = Math.round(Number(r.value) * (discount ? 1000 : 100));
    if (!Number.isSafeInteger(value) || value < (discount ? 1 : 0) || value > (discount ? 10000 : 100000000)) throw new Error(discount ? '折扣范围 0.001–10 折' : '金额范围 0–1000000 元');
    return { scope, enabled: r.enabled, pricingMode: modes[r.mode], pricingValue: value, participantPricing: scope === 'ACTIVITY' && r.participantPolicy > 0 ? (r.participantPolicy === 1 ? 'ACCOUNT_ALL' : 'ONE_BENEFIT') : null };
  });
  return { name, sortOrder: Number(f.sortOrder), enabled: f.enabled, rules, version };
}
export interface ShopQuote {
  productId: string; quantity: number; originalTotalCents: number; totalCents: number;
  pricing: {originalPriceCents: number; priceCents: number; tierId: string | null; tierName: string | null; tierVersion: number | null; pricingMode: PricingMode | null; pricingValue: number | null};
}
export function validShopQuote(q: ShopQuote, id: string, quantity: number): boolean {
  return !!q && q.productId === id && q.quantity === quantity && !!q.pricing
    && [q.originalTotalCents,q.totalCents,q.pricing.originalPriceCents,q.pricing.priceCents].every(v=>Number.isSafeInteger(v)&&v>=0)
    && q.totalCents === q.pricing.priceCents*quantity && q.originalTotalCents === q.pricing.originalPriceCents*quantity;
}
