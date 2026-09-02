export type Verdict = "match" | "review" | "reject";
export type Classification = { verdict: Verdict; confidence: number; reasons: string[]; warnings: string[]; facts: { capacity?: string; sticks?: string; formFactor?: string; condition: string } };
const has = (text: string, pattern: RegExp) => pattern.test(text);

export function classifyMemoryListing(source: string): Classification {
  const text = source.normalize("NFKC").toLowerCase();
  const reasons: string[] = [];
  const warnings: string[] = [];
  const isDdr4 = has(text, /ddr\s*4|pc4[-\s]?25600/);
  const is3200 = has(text, /(?:ddr4[-\s]?)?3200|pc4[-\s]?25600/);
  const isSodimm = has(text, /so[-\s]?dimm|sodimm|ノート(?:pc)?用/);
  const isEcc = has(text, /\becc\b|registered|reg(?:istered)?\s*dimm|サーバー用/);
  const unbuffered = has(text, /u[-\s]?dimm|udimm|unbuffered|デスクトップ(?:pc)?用/);
  const twoSticks = has(text, /32\s*gb\s*[x×*]\s*2|32\s*gb\s*2枚|2\s*[x×*]\s*32\s*gb|64\s*gb\s*\(\s*32\s*gb/);
  const singleStick = has(text, /32\s*gb\s*(?:1枚|単品)|片方のみ|1\s*[x×*]\s*32\s*gb/);
  const notIncluded = has(text, /メモリ(?:ー)?(?:は|が)?付属しません|メモリ(?:ー)?なし|本体のみ.*(?:マザー|pc)/);
  const compatibilityOnly = has(text, /64\s*gb対応|最大64\s*gb/) && !twoSticks;
  const unsafeCondition = has(text, /ジャンク|動作未確認|未チェック|保証なし/);
  if (isDdr4) reasons.push("DDR4を確認"); else warnings.push("DDR4の記載が見つからない");
  if (is3200) reasons.push("DDR4-3200 / PC4-25600を確認"); else warnings.push("3200の記載が見つからない");
  if (twoSticks) reasons.push("32GB×2のセット表記を確認"); else warnings.push("32GB×2の確証がない");
  if (unbuffered && !isSodimm) reasons.push("デスクトップ用の表記を確認");
  if (isSodimm) warnings.push("ノート用SO-DIMMを検出");
  if (isEcc) warnings.push("ECC / サーバー用を検出");
  if (singleStick) warnings.push("32GB単品または片方のみを検出");
  if (notIncluded) warnings.push("メモリ本体が付属しない可能性");
  if (compatibilityOnly) warnings.push("64GBの商品ではなく対応容量の記載");
  if (unsafeCondition) warnings.push("動作保証に関する危険表記を検出");
  const hardReject = isSodimm || isEcc || singleStick || notIncluded || compatibilityOnly || unsafeCondition;
  const allCoreFacts = isDdr4 && is3200 && twoSticks;
  const verdict: Verdict = hardReject ? "reject" : allCoreFacts ? "match" : "review";
  const confidence = verdict === "match" ? Math.min(98, 76 + reasons.length * 5) : verdict === "reject" ? Math.min(99, 82 + warnings.length * 4) : Math.max(35, 68 - warnings.length * 7);
  return { verdict, confidence, reasons, warnings, facts: { capacity: twoSticks ? "64GB" : has(text, /32\s*gb/) ? "32GB?" : undefined, sticks: twoSticks ? "2枚" : singleStick ? "1枚" : undefined, formFactor: isSodimm ? "SO-DIMM" : unbuffered ? "DIMM" : undefined, condition: unsafeCondition ? "危険" : has(text, /動作確認済|動作品/) ? "確認済み" : "記載なし" } };
}
