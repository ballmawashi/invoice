import { useState, useRef } from "react";

// ============================================================
// UTILS
// ============================================================
const formatYen = (n) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");

const calcItem = (item) => {
  const qty = parseFloat(item.qty) || 0;
  const rate = parseFloat(item.taxRate) || 0;
  if (item.taxMode === "inclusive") {
    const unitInclusive = parseFloat(item.unitPrice) || 0;
    const totalInclusive = Math.floor(qty * unitInclusive);
    const taxExcluded = rate > 0 ? Math.floor(totalInclusive / (1 + rate)) : totalInclusive;
    const taxAmount = totalInclusive - taxExcluded;
    return { taxExcluded, taxAmount, total: totalInclusive };
  } else {
    const unitExclusive = parseFloat(item.unitPrice) || 0;
    const taxExcluded = Math.floor(qty * unitExclusive);
    const taxAmount = Math.floor(taxExcluded * rate);
    return { taxExcluded, taxAmount, total: taxExcluded + taxAmount };
  }
};

const calcTotals = (items) => {
  let subtotal = 0;
  const taxGroups = {};
  items.forEach((item) => {
    const { taxExcluded, taxAmount } = calcItem(item);
    subtotal += taxExcluded;
    const rate = parseFloat(item.taxRate) || 0;
    if (rate > 0) {
      const rateKey = item.taxRate;
      if (!taxGroups[rateKey]) taxGroups[rateKey] = 0;
      taxGroups[rateKey] += taxAmount;
    }
  });
  const totalTax = Object.values(taxGroups).reduce((a, b) => a + b, 0);
  return { subtotal, taxGroups, totalTax, grandTotal: subtotal + totalTax };
};

const genId = () => Math.random().toString(36).slice(2, 9);
const esc = (str) => String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const today = () => new Date().toISOString().split("T")[0];
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().split("T")[0];
};

const STORAGE_KEY = "invoiceApp_v2";
const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };
const save = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

const defaultItem = () => ({ id: genId(), name: "", taxMode: "exclusive", qty: 1, unitPrice: "", taxRate: "0.10" });

const statusLabels = { draft: "下書き", sent: "送付済み", paid: "入金済み", cancelled: "キャンセル" };

const DOC_TYPES = [
  { value: "invoice",  label: "請求書", bannerLabel: "ご請求金額",  noLabel: "請求書番号", dateLabel: "発行日", date2Label: "支払期限", showDate2: true  },
  { value: "estimate", label: "見積書", bannerLabel: "お見積金額",  noLabel: "見積書番号", dateLabel: "発行日", date2Label: "有効期限", showDate2: true  },
  { value: "delivery", label: "納品書", bannerLabel: "納品金額",    noLabel: "納品書番号", dateLabel: "納品日", date2Label: "",         showDate2: false },
  { value: "receipt",  label: "受領書", bannerLabel: "受領金額",    noLabel: "受領書番号", dateLabel: "受領日", date2Label: "",         showDate2: false },
];
const getDocType = (v) => DOC_TYPES.find(d => d.value === v) || DOC_TYPES[0];
const statusColors = { draft: "#8B7355", sent: "#2563EB", paid: "#16A34A", cancelled: "#DC2626" };

// ============================================================
// PRIMITIVE COMPONENTS
// ============================================================
function Field({ label, children, required }) {
  return (
    <div style={S.field}>
      <label style={S.label}>{label}{required && <span style={{ color: "#C84B31" }}> *</span>}</label>
      {children}
    </div>
  );
}
function Input(props) { return <input style={S.input} {...props} />; }
function Select({ children, ...props }) { return <select style={S.input} {...props}>{children}</select>; }
function Btn({ children, onClick, variant = "primary", style: s, disabled }) {
  const base = variant === "primary" ? S.btnPrimary : variant === "ghost" ? S.btnGhost : variant === "danger" ? S.btnDanger : S.btnSecondary;
  return <button style={{ ...base, ...s, opacity: disabled ? 0.5 : 1 }} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Toggle({ options, value, onChange }) {
  return (
    <div style={S.toggleWrap}>
      {options.map(o => (
        <button key={o.value} style={{ ...S.toggleBtn, ...(value === o.value ? S.toggleBtnActive : {}) }} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// ============================================================
// SETTINGS SCREEN
// ============================================================
function SettingsScreen({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isCorp = (form.entityType || "corporate") === "corporate";

  return (
    <div style={S.screen}>
      <h2 style={S.screenTitle}>⚙️ 会社設定</h2>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>事業者種別</h3>
        <Toggle
          options={[{ value: "corporate", label: "法人" }, { value: "individual", label: "個人事業主" }]}
          value={form.entityType || "corporate"}
          onChange={v => set("entityType", v)}
        />
      </div>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>会社情報</h3>
        <Field label={isCorp ? "会社名" : "屋号・氏名"} required>
          <Input value={form.companyName || ""} onChange={e => set("companyName", e.target.value)} placeholder={isCorp ? "株式会社〇〇" : "〇〇事務所"} />
        </Field>
        {isCorp ? (
          <Field label="代表取締役氏名">
            <Input value={form.ceoName || ""} onChange={e => set("ceoName", e.target.value)} placeholder="代表取締役　山田 太郎" />
          </Field>
        ) : (
          <Field label="氏名">
            <Input value={form.repName || ""} onChange={e => set("repName", e.target.value)} placeholder="山田 太郎" />
          </Field>
        )}
        <Field label="郵便番号"><Input value={form.zip || ""} onChange={e => set("zip", e.target.value)} placeholder="000-0000" /></Field>
        <Field label="住所"><Input value={form.address || ""} onChange={e => set("address", e.target.value)} placeholder="東京都〇〇区〇〇1-2-3" /></Field>
        <Field label="電話番号"><Input value={form.tel || ""} onChange={e => set("tel", e.target.value)} placeholder="03-0000-0000" /></Field>
        <Field label="メールアドレス"><Input value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="info@example.com" /></Field>
      </div>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>振込先</h3>
        <Field label="銀行名"><Input value={form.bankName || ""} onChange={e => set("bankName", e.target.value)} placeholder="〇〇銀行" /></Field>
        <Field label="支店名"><Input value={form.branchName || ""} onChange={e => set("branchName", e.target.value)} placeholder="〇〇支店" /></Field>
        <Field label="口座種別">
          <Select value={form.accountType || "普通"} onChange={e => set("accountType", e.target.value)}>
            <option>普通</option><option>当座</option>
          </Select>
        </Field>
        <Field label="口座番号"><Input value={form.accountNumber || ""} onChange={e => set("accountNumber", e.target.value)} placeholder="0000000" /></Field>
        <Field label="口座名義"><Input value={form.accountName || ""} onChange={e => set("accountName", e.target.value)} placeholder="カブシキガイシャ〇〇" /></Field>
      </div>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>請求書設定</h3>
        <Field label="請求書番号プレフィックス"><Input value={form.invoicePrefix || "INV"} onChange={e => set("invoicePrefix", e.target.value)} placeholder="INV" /></Field>
        <Field label="開始番号"><Input type="number" value={form.invoiceStartNum || 1} onChange={e => set("invoiceStartNum", parseInt(e.target.value))} /></Field>
        <Field label="インボイス登録番号（空欄なら請求書に記載しない）">
          <Input value={form.invoiceRegNumber || ""} onChange={e => set("invoiceRegNumber", e.target.value)} placeholder="T1234567890123" />
        </Field>
        <Field label="デフォルト税率">
          <Select value={form.defaultTaxRate || "0.10"} onChange={e => set("defaultTaxRate", e.target.value)}>
            <option value="0">0%</option><option value="0.08">8%</option><option value="0.10">10%</option>
          </Select>
        </Field>
        <Field label="端数処理">
          <Select value={form.roundingMode || "floor"} onChange={e => set("roundingMode", e.target.value)}>
            <option value="floor">切り捨て</option><option value="round">四捨五入</option><option value="ceil">切り上げ</option>
          </Select>
        </Field>
      </div>

      <Btn onClick={() => onSave(form)} style={{ width: "100%", marginTop: 8 }}>保存する</Btn>
    </div>
  );
}

// ============================================================
// ITEM ROW
// ============================================================
function ItemRow({ item, onChange, onRemove }) {
  const calc = calcItem(item);
  const isInclusive = item.taxMode === "inclusive";
  return (
    <div style={S.itemRow}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Toggle
          options={[{ value: "exclusive", label: "外税" }, { value: "inclusive", label: "内税" }]}
          value={item.taxMode || "exclusive"}
          onChange={v => onChange("taxMode", v)}
        />
        <button style={S.removeBtn} onClick={onRemove}>×</button>
      </div>
      <Input value={item.name} onChange={e => onChange("name", e.target.value)} placeholder="品目名・作業内容" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <label style={S.miniLabel}>数量</label>
          <Input type="number" value={item.qty} onChange={e => onChange("qty", e.target.value)} />
        </div>
        <div>
          <label style={S.miniLabel}>単価（{isInclusive ? "税込" : "税抜"}・円）</label>
          <Input type="number" value={item.unitPrice} onChange={e => onChange("unitPrice", e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={S.miniLabel}>税率</label>
          <Select value={item.taxRate} onChange={e => onChange("taxRate", e.target.value)}>
            <option value="0">0%</option><option value="0.08">8%</option><option value="0.10">10%</option>
          </Select>
        </div>
      </div>
      <div style={S.itemCalc}>
        {isInclusive ? (
          <>
            <span style={S.calcChipMuted}>税抜: {formatYen(calc.taxExcluded)}</span>
            <span style={S.calcChipMuted}>消費税: {formatYen(calc.taxAmount)}</span>
          </>
        ) : (
          <>
            <span style={S.calcChipMuted}>税抜計: {formatYen(calc.taxExcluded)}</span>
            <span style={S.calcChipMuted}>消費税: {formatYen(calc.taxAmount)}</span>
          </>
        )}
        <span style={S.calcChipTotal}>合計: {formatYen(calc.total)}</span>
      </div>
    </div>
  );
}

// ============================================================
// INVOICE FORM
// ============================================================
function InvoiceForm({ settings, invoices, onSave, editInvoice, onCancel }) {
  const nextNum = (settings.invoiceStartNum || 1) + invoices.filter(i => i.status !== "cancelled").length;
  const defaultNum = `${settings.invoicePrefix || "INV"}-${String(nextNum).padStart(3, "0")}`;

  const [form, setForm] = useState(editInvoice || {
    id: genId(), docType: "invoice", invoiceNo: defaultNum, issueDate: today(), dueDate: nextMonth(),
    clientName: "", clientAddress: "", clientDept: "", subject: "", note: "",
    items: [defaultItem()], status: "draft",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (idx, k, v) => { const items = [...form.items]; items[idx] = { ...items[idx], [k]: v }; setForm(f => ({ ...f, items })); };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...defaultItem(), taxRate: settings.defaultTaxRate || "0.10" }] }));
  const removeItem = (idx) => { const items = form.items.filter((_, i) => i !== idx); setForm(f => ({ ...f, items: items.length ? items : [defaultItem()] })); };
  const { subtotal, taxGroups, grandTotal } = calcTotals(form.items);
  const [preview, setPreview] = useState(false);

  if (preview) {
    return <InvoicePreview invoice={form} settings={settings} onBack={() => setPreview(false)} onSave={() => onSave({ ...form, status: form.status || "draft" })} />;
  }

  return (
    <div style={S.screen}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {onCancel && <button style={S.backBtn} onClick={onCancel}>← 戻る</button>}
        <h2 style={{ ...S.screenTitle, margin: 0 }}>📄 書類作成</h2>
      </div>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>書類種別</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {DOC_TYPES.map(dt => (
            <button key={dt.value} onClick={() => set("docType", dt.value)}
              style={{ padding: "8px 0", borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 13, fontWeight: 700,
                borderColor: form.docType === dt.value ? "#2C3E50" : "#E5E7EB",
                background: form.docType === dt.value ? "#2C3E50" : "#fff",
                color: form.docType === dt.value ? "#fff" : "#374151" }}>
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      {(() => {
        const dt = getDocType(form.docType);
        return (
          <div style={S.card}>
            <h3 style={S.sectionTitle}>基本情報</h3>
            <Field label={dt.noLabel} required><Input value={form.invoiceNo} onChange={e => set("invoiceNo", e.target.value)} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: dt.showDate2 ? "1fr 1fr" : "1fr", gap: 12 }}>
              <Field label={dt.dateLabel}><Input type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></Field>
              {dt.showDate2 && <Field label={dt.date2Label}><Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></Field>}
            </div>
          </div>
        );
      })()}

      <div style={S.card}>
        <h3 style={S.sectionTitle}>{getDocType(form.docType).label}先</h3>
        <Field label="会社名" required><Input value={form.clientName} onChange={e => set("clientName", e.target.value)} placeholder="株式会社〇〇 御中" /></Field>
        <Field label="部署・担当者"><Input value={form.clientDept || ""} onChange={e => set("clientDept", e.target.value)} placeholder="〇〇部 〇〇様" /></Field>
        <Field label="住所"><Input value={form.clientAddress || ""} onChange={e => set("clientAddress", e.target.value)} placeholder="東京都〇〇区..." /></Field>
        <Field label="件名" required><Input value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="〇〇業務委託料" /></Field>
      </div>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>明細</h3>
        {form.items.map((item, idx) => (
          <ItemRow key={item.id} item={item} idx={idx} onChange={(k, v) => setItem(idx, k, v)} onRemove={() => removeItem(idx)} />
        ))}
        <Btn variant="ghost" onClick={addItem} style={{ width: "100%", marginTop: 8 }}>＋ 明細を追加</Btn>
      </div>

      <div style={{ background:"#fff", borderRadius:12, marginBottom:14, boxShadow:"0 1px 4px rgba(0,0,0,0.08)", overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 16px", borderBottom:"1px solid #F3F4F6" }}>
          <span style={{ fontSize:"13px", color:"#4B5563" }}>小計（税抜）</span>
          <span style={{ fontSize:"13px", color:"#4B5563" }}>{formatYen(subtotal)}</span>
        </div>
        {Object.entries(taxGroups).map(([rate, amount]) => (
          <div key={rate} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 16px", borderBottom:"1px solid #F3F4F6" }}>
            <span style={{ fontSize:"13px", color:"#4B5563" }}>消費税（{Math.round(parseFloat(rate)*100)}%）</span>
            <span style={{ fontSize:"13px", color:"#4B5563" }}>{formatYen(amount)}</span>
          </div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:"#2C3E50" }}>
          <span style={{ fontSize:"13px", fontWeight:800, color:"#fff" }}>合計金額</span>
          <span style={{ fontSize:"13px", fontWeight:800, color:"#fff" }}>{formatYen(grandTotal)}</span>
        </div>
      </div>

      <div style={S.card}>
        <h3 style={S.sectionTitle}>備考</h3>
        <textarea style={{ ...S.input, height: 80, resize: "vertical" }} value={form.note} onChange={e => set("note", e.target.value)} placeholder="お振込手数料はご負担願います。" />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <Btn variant="secondary" onClick={() => onSave({ ...form, status: "draft" })} style={{ flex: 1 }}>下書き保存</Btn>
        <Btn onClick={() => setPreview(true)} style={{ flex: 1 }}>プレビュー・PDF</Btn>
      </div>
    </div>
  );
}

// ============================================================
// INVOICE PREVIEW — A4 full-page scaled preview + print
// ============================================================
function InvoicePreview({ invoice, settings, onBack, onSave }) {
  const { subtotal, taxGroups, grandTotal } = calcTotals(invoice.items);
  const printRef = useRef();
  const isCorp = (settings.entityType || "corporate") === "corporate";
  const issuerName = isCorp ? settings.companyName : (settings.companyName || settings.repName || "");
  const issuerPerson = isCorp ? settings.ceoName : settings.repName;

  const handlePrint = () => {
    const inv = invoice;
    const s = settings;
    const isCorp2 = (s.entityType || "corporate") === "corporate";
    const iName = isCorp2 ? s.companyName : (s.companyName || s.repName || "");
    const iPerson = isCorp2 ? s.ceoName : s.repName;
    const { subtotal: sub, taxGroups: tg, grandTotal: gt } = calcTotals(inv.items);
    const dt = getDocType(inv.docType);

    const taxRows = Object.entries(tg).map(([rate, amt]) =>
      `<tr><td style="padding:5px 10px;border-bottom:1px solid #eee;">消費税（${Math.round(parseFloat(rate)*100)}%）</td><td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;">${formatYen(amt)}</td></tr>`
    ).join("");

    const itemRows = inv.items.map(item => {
      const c = calcItem(item);
      const qty = parseFloat(item.qty) || 1;
      const unitEx = qty > 0 ? Math.floor(c.taxExcluded / qty) : 0;
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #ddd;">${esc(item.name)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${esc(qty)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${formatYen(unitEx)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${Math.round(parseFloat(item.taxRate)*100)}%</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${formatYen(c.taxAmount)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${formatYen(c.total)}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="utf-8">
<title>${esc(dt.label)}_${esc(inv.invoiceNo)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Hiragino Kaku Gothic ProN","Meiryo","Yu Gothic","MS PGothic",sans-serif; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:210mm; min-height:297mm; padding:18mm 16mm; background:#fff; margin:0 auto; }
  @media screen { body { background:#ccc; } .page { box-shadow:0 0 20px rgba(0,0,0,0.2); margin:20px auto; } }
  table { width:100%; border-collapse:collapse; }
</style>
</head><body><div class="page">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2C3E50;padding-bottom:16px;margin-bottom:20px;">
    <h1 style="font-size:22px;font-weight:900;letter-spacing:8px;color:#1a1a1a;">${esc(dt.label)}</h1>
    <div style="text-align:right;font-size:10px;line-height:2;color:#444;">
      <div>${esc(dt.noLabel)}：<strong>${esc(inv.invoiceNo)}</strong></div>
      <div>${esc(dt.dateLabel)}：${esc(inv.issueDate)}</div>
      ${dt.showDate2 ? `<div>${esc(dt.date2Label)}：${esc(inv.dueDate)}</div>` : ""}
    </div>
  </div>

  <div style="display:flex;gap:24px;margin-bottom:18px;">
    <div style="flex:1;">
      <div style="font-size:16px;font-weight:800;border-bottom:2px solid #2C3E50;padding-bottom:4px;margin-bottom:6px;">${esc(inv.clientName)} 御中</div>
      ${inv.clientDept ? `<div style="font-size:10px;color:#555;line-height:1.7;">${esc(inv.clientDept)}</div>` : ""}
      ${inv.clientAddress ? `<div style="font-size:10px;color:#555;line-height:1.7;">${esc(inv.clientAddress)}</div>` : ""}
      <div style="margin-top:8px;font-size:12px;font-weight:700;">件名：${esc(inv.subject)}</div>
    </div>
    <div style="flex:1;text-align:right;">
      <div style="font-size:14px;font-weight:800;margin-bottom:4px;">${esc(iName)}</div>
      ${iPerson ? `<div style="font-size:10px;color:#555;line-height:1.9;">${esc(iPerson)}</div>` : ""}
      ${s.zip ? `<div style="font-size:10px;color:#555;line-height:1.9;">〒${esc(s.zip)}</div>` : ""}
      ${s.address ? `<div style="font-size:10px;color:#555;line-height:1.9;">${esc(s.address)}</div>` : ""}
      ${s.tel ? `<div style="font-size:10px;color:#555;line-height:1.9;">TEL：${esc(s.tel)}</div>` : ""}
      ${s.email ? `<div style="font-size:10px;color:#555;line-height:1.9;">${esc(s.email)}</div>` : ""}
      ${s.invoiceRegNumber ? `<div style="font-size:10px;color:#555;line-height:1.9;margin-top:4px;">登録番号：${esc(s.invoiceRegNumber)}</div>` : ""}
    </div>
  </div>

  <div style="background:#2C3E50;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-radius:4px;margin-bottom:18px;">
    <span style="font-size:12px;">${esc(dt.bannerLabel)}</span>
    <span style="font-size:20px;font-weight:900;">${formatYen(gt)}（税込）</span>
  </div>

  <table style="margin-bottom:18px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:7px 8px;border:1px solid #ccc;font-size:11px;width:40%;">品目・内容</th>
        <th style="padding:7px 8px;border:1px solid #ccc;font-size:11px;width:8%;">数量</th>
        <th style="padding:7px 8px;border:1px solid #ccc;font-size:11px;width:16%;">単価（税抜）</th>
        <th style="padding:7px 8px;border:1px solid #ccc;font-size:11px;width:8%;">税率</th>
        <th style="padding:7px 8px;border:1px solid #ccc;font-size:11px;width:13%;">消費税</th>
        <th style="padding:7px 8px;border:1px solid #ccc;font-size:11px;width:15%;">金額（税込）</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:16px;">
    <div style="flex:1;">
      ${inv.note ? `<div style="font-size:10px;font-weight:700;color:#666;margin-bottom:4px;">備考</div><div style="font-size:10px;line-height:1.8;color:#444;">${esc(inv.note)}</div>` : ""}
    </div>
    <div style="width:200px;border:1px solid #ddd;border-radius:4px;overflow:hidden;">
      <table style="margin:0;">
        <tr><td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:10px;">小計（税抜）</td><td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;font-size:10px;">${formatYen(sub)}</td></tr>
        ${taxRows}
        <tr style="background:#2C3E50;color:#fff;"><td style="padding:7px 10px;font-size:11px;font-weight:800;">合計金額</td><td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:800;">${formatYen(gt)}</td></tr>
      </table>
    </div>
  </div>

  ${s.bankName && inv.docType === "invoice" ? `
  <div style="border-top:1px solid #ddd;padding-top:12px;">
    <div style="font-size:10px;font-weight:700;color:#666;margin-bottom:4px;">お振込先</div>
    <div style="font-size:10px;line-height:1.8;color:#444;">${esc(s.bankName)} ${esc(s.branchName)}　${esc(s.accountType)}　${esc(s.accountNumber)}　${esc(s.accountName)}</div>
  </div>` : ""}

</div></body></html>`;

    // Create Blob and trigger download
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${esc(dt.label)}_${esc(inv.invoiceNo)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };



  // A4 ratio preview: scale to fit container
  const A4Content = (
    <div ref={printRef} style={A4.page}>
      {/* Header */}
      <div className="header" style={A4.header}>
        <h1 className="title" style={A4.title}>{getDocType(invoice.docType).label.split("").join("　")}</h1>
        <div className="meta-right" style={A4.metaRight}>
          {(() => { const dt = getDocType(invoice.docType); return (<>
            <div>{dt.noLabel}：<strong>{invoice.invoiceNo}</strong></div>
            <div>{dt.dateLabel}：{invoice.issueDate}</div>
            {dt.showDate2 && <div>{dt.date2Label}：{invoice.dueDate}</div>}
          </>); })()}
        </div>
      </div>

      {/* Two-column: client left, issuer right */}
      <div className="two-col" style={A4.twoCol}>
        <div className="client-box" style={A4.clientBox}>
          <div className="client-name" style={A4.clientName}>{invoice.clientName} 御中</div>
          {invoice.clientDept && <div className="client-sub" style={A4.clientSub}>{invoice.clientDept}</div>}
          {invoice.clientAddress && <div className="client-sub" style={A4.clientSub}>{invoice.clientAddress}</div>}
          <div className="subject-line" style={A4.subject}>件名：{invoice.subject}</div>
        </div>
        <div className="issuer-box" style={A4.issuerBox}>
          <div className="issuer-name" style={A4.issuerName}>{issuerName}</div>
          {issuerPerson && <div className="issuer-sub" style={A4.issuerSub}>{issuerPerson}</div>}
          {settings.zip && <div style={A4.issuerSub}>〒{settings.zip}</div>}
          {settings.address && <div style={A4.issuerSub}>{settings.address}</div>}
          {settings.tel && <div style={A4.issuerSub}>TEL：{settings.tel}</div>}
          {settings.email && <div style={A4.issuerSub}>{settings.email}</div>}
          {settings.invoiceRegNumber && <div style={{ ...A4.issuerSub, marginTop: 6 }}>登録番号：{settings.invoiceRegNumber}</div>}
        </div>
      </div>

      {/* Total banner */}
      <div className="total-banner" style={A4.totalBanner}>
        <span className="total-banner-label" style={{ fontSize: 13 }}>{getDocType(invoice.docType).bannerLabel}</span>
        <span className="total-banner-amt" style={A4.totalAmount}>{formatYen(grandTotal)}（税込）</span>
      </div>

      {/* Items table */}
      <table style={A4.table}>
        <thead>
          <tr>
            <th style={{ ...A4.th, width: "42%" }}>品目・内容</th>
            <th style={{ ...A4.th, width: "9%" }}>数量</th>
            <th style={{ ...A4.th, width: "16%" }}>単価（税抜）</th>
            <th style={{ ...A4.th, width: "8%" }}>税率</th>
            <th style={{ ...A4.th, width: "11%" }}>消費税</th>
            <th style={{ ...A4.th, width: "14%" }}>金額（税込）</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => {
            const c = calcItem(item);
            const qty = parseFloat(item.qty) || 1;
            const unitExcluded = qty > 0 ? Math.floor(c.taxExcluded / qty) : 0;
            return (
              <tr key={item.id}>
                <td style={A4.td}>{item.name}</td>
                <td style={{ ...A4.td, textAlign: "center" }}>{qty}</td>
                <td style={{ ...A4.td, textAlign: "right" }}>{formatYen(unitExcluded)}</td>
                <td style={{ ...A4.td, textAlign: "center" }}>{Math.round(parseFloat(item.taxRate) * 100)}%</td>
                <td style={{ ...A4.td, textAlign: "right" }}>{formatYen(c.taxAmount)}</td>
                <td style={{ ...A4.td, textAlign: "right" }}>{formatYen(c.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary row: note left, calc box right */}
      <div className="summary-row" style={A4.summaryRow}>
        <div className="note-box" style={A4.noteBox}>
          {invoice.note && (
            <div>
              <div className="note-title" style={A4.noteTitle}>備考</div>
              <div className="note-text" style={A4.noteText}>{invoice.note}</div>
            </div>
          )}
        </div>
        <div className="calc-box" style={A4.calcBox}>
          <div className="calc-row" style={A4.calcRow}><span>小計（税抜）</span><span>{formatYen(subtotal)}</span></div>
          {Object.entries(taxGroups).map(([rate, amt]) => (
            <div key={rate} className="calc-row" style={A4.calcRow}>
              <span style={{ whiteSpace:"nowrap" }}>消費税（{Math.round(parseFloat(rate) * 100)}%）</span>
              <span style={{ whiteSpace:"nowrap" }}>{formatYen(amt)}</span>
            </div>
          ))}
          <div className="calc-total" style={A4.calcTotal}><span>合計金額</span><span>{formatYen(grandTotal)}</span></div>
        </div>
      </div>
      {/* Bank info below totals */}
      {settings.bankName && invoice.docType !== "estimate" && invoice.docType !== "delivery" && invoice.docType !== "receipt" && (
        <div className="bank-section" style={A4.bankSection}>
          <div className="note-title" style={A4.noteTitle}>お振込先</div>
          <div className="note-text" style={A4.noteText}>
            {settings.bankName} {settings.branchName}　{settings.accountType}　{settings.accountNumber}　{settings.accountName}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={S.screen}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button style={S.backBtn} onClick={onBack}>← 編集に戻る</button>
        <Btn onClick={onSave} variant="secondary" style={{ fontSize: 13, padding: "8px 14px" }}>💾 保存する</Btn>
        <Btn onClick={handlePrint} style={{ fontSize: 13, padding: "8px 14px" }}>⬇️ HTMLダウンロード</Btn>
      </div>

      {/* Scaled A4 preview that shows the full page */}
      <div style={S.previewOuter}>
        <div style={S.previewScaler}>
          {A4Content}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ARCHIVE SCREEN
// ============================================================
function ArchiveScreen({ invoices, settings, onEdit, onDelete, onNew }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detail, setDetail] = useState(null);

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.clientName.includes(search) || inv.invoiceNo.includes(search) || inv.subject.includes(search);
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (detail) {
    return <InvoicePreview invoice={detail} settings={settings} onBack={() => setDetail(null)} onSave={() => setDetail(null)} />;
  }

  return (
    <div style={S.screen}>
      <h2 style={S.screenTitle}>🗂️ アーカイブ</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 検索..." style={{ flex: 1, minWidth: 120 }} />
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ flex: "0 0 auto" }}>
          <option value="all">すべて</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {filtered.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40 }}>📭</div>
          <div>請求書がありません</div>
          <Btn onClick={onNew} style={{ marginTop: 12 }}>新規作成</Btn>
        </div>
      ) : (
        filtered.slice().reverse().map(inv => {
          const { grandTotal } = calcTotals(inv.items);
          return (
            <div key={inv.id} style={S.archiveCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={S.archiveNo}>{inv.invoiceNo}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", background:"#F3F4F6", borderRadius:4, padding:"1px 6px" }}>{getDocType(inv.docType).label}</div>
                  </div>
                  <div style={S.archiveClient}>{inv.clientName}</div>
                  <div style={S.archiveSub}>{inv.subject}</div>
                  <div style={S.archiveMeta}>{inv.issueDate} 発行 | 期限：{inv.dueDate}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...S.statusBadge, background: statusColors[inv.status] }}>{statusLabels[inv.status]}</div>
                  <div style={S.archiveAmount}>{formatYen(grandTotal)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Btn variant="ghost" onClick={() => setDetail(inv)} style={{ flex: 1, fontSize: 12 }}>表示</Btn>
                <Btn variant="ghost" onClick={() => onEdit(inv)} style={{ flex: 1, fontSize: 12 }}>編集</Btn>
                <Btn variant="danger" onClick={() => onDelete(inv.id)} style={{ flex: 1, fontSize: 12 }}>削除</Btn>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const stored = load();
  const [settings, setSettings] = useState(stored.settings || {
    companyName: "", entityType: "corporate", invoicePrefix: "INV", invoiceStartNum: 1, defaultTaxRate: "0.10", roundingMode: "floor"
  });
  const [invoices, setInvoices] = useState(stored.invoices || []);
  const [tab, setTab] = useState("home");
  const [editInvoice, setEditInvoice] = useState(null);
  const [toast, setToast] = useState(null);
  const [homeDetail, setHomeDetail] = useState(null);

  const persist = (s, inv) => { setSettings(s); setInvoices(inv); save({ settings: s, invoices: inv }); };
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const saveSettings = (s) => { persist(s, invoices); showToast("設定を保存しました"); setTab("home"); };
  const saveInvoice = (inv) => {
    const updated = invoices.find(i => i.id === inv.id)
      ? invoices.map(i => i.id === inv.id ? inv : i)
      : [...invoices, inv];
    persist(settings, updated);
    showToast("請求書を保存しました");
    setEditInvoice(null);
    setTab("archive");
  };
  const deleteInvoice = (id) => {
    if (!window.confirm("この請求書を削除しますか？")) return;
    persist(settings, invoices.filter(i => i.id !== id));
    showToast("削除しました");
  };

  const { grandTotal: totalRevenue } = calcTotals(invoices.flatMap(i => i.items));

  return (
    <div style={S.app}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.content}>
        {tab === "home" && homeDetail && (
          <InvoicePreview invoice={homeDetail} settings={settings}
            onBack={() => setHomeDetail(null)}
            onSave={() => { setHomeDetail(null); }} />
        )}
        {tab === "home" && !homeDetail && (
          <div style={S.screen}>
            <h2 style={S.screenTitle}>🏠 ホーム</h2>
            <div style={S.statsGrid}>
              <div style={S.statCard}><div style={S.statNum}>{invoices.length}</div><div style={S.statLabel}>請求書総数</div></div>
              <div style={S.statCard}><div style={S.statNum}>{invoices.filter(i => i.status === "paid").length}</div><div style={S.statLabel}>入金済み</div></div>
              <div style={{ ...S.statCard, gridColumn: "1/-1" }}>
                <div style={{ ...S.statNum, fontSize: 22 }}>{formatYen(totalRevenue)}</div>
                <div style={S.statLabel}>合計請求額</div>
              </div>
            </div>
            <Btn onClick={() => { setEditInvoice(null); setTab("new"); }} style={{ width: "100%", marginBottom: 12, padding: "14px 0", fontSize: 16 }}>
              ＋ 新規請求書を作成
            </Btn>
            <div style={S.recentTitle}>最近の請求書</div>
            {invoices.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>まだ請求書がありません</div>}
            {invoices.slice(-3).reverse().map(inv => {
              const { grandTotal } = calcTotals(inv.items);
              return (
                <div key={inv.id} onClick={() => { setHomeDetail(inv); }}
                  style={{ ...S.archiveCard, marginBottom: 8, cursor: "pointer", transition: "box-shadow 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.07)"}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <span style={S.archiveNo}>{inv.invoiceNo}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:"#6B7280", background:"#F3F4F6", borderRadius:4, padding:"1px 5px", marginLeft:4 }}>{getDocType(inv.docType).label}</span>
                      <span style={{ marginLeft: 8, color: "#555", fontSize: 13 }}>{inv.clientName}</span>
                    </div>
                    <div style={{ ...S.statusBadge, background: statusColors[inv.status] }}>{statusLabels[inv.status]}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: "#777", fontSize: 12 }}>{inv.issueDate}</span>
                    <span style={{ fontWeight: 700 }}>{formatYen(grandTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === "new" && (
          <InvoiceForm settings={settings} invoices={invoices} onSave={saveInvoice} editInvoice={editInvoice} onCancel={() => { setEditInvoice(null); setTab("home"); }} />
        )}
        {tab === "archive" && (
          <ArchiveScreen invoices={invoices} settings={settings} onEdit={(inv) => { setEditInvoice(inv); setTab("new"); }} onDelete={deleteInvoice} onNew={() => { setEditInvoice(null); setTab("new"); }} />
        )}
        {tab === "settings" && (
          <SettingsScreen settings={settings} onSave={saveSettings} />
        )}
      </div>

      <nav style={S.nav}>
        {[
          { id: "home", icon: "🏠", label: "ホーム" },
          { id: "new", icon: "📄", label: "新規作成" },
          { id: "archive", icon: "🗂️", label: "一覧" },
          { id: "settings", icon: "⚙️", label: "設定" },
        ].map(item => (
          <button key={item.id} style={{ ...S.navBtn, color: tab === item.id ? "#2C3E50" : "#9CA3AF" }}
            onClick={() => { if (item.id === "new") setEditInvoice(null); setTab(item.id); }}>
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: tab === item.id ? 700 : 400 }}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const S = {
  app: { maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F8F7F4", fontFamily: "'Hiragino Kaku Gothic ProN','Meiryo',sans-serif", position: "relative" },
  content: { flex: 1, paddingBottom: 80, overflowY: "auto" },
  screen: { padding: "20px 12px 16px" },
  screenTitle: { fontSize: 20, fontWeight: 700, color: "#2C3E50", marginBottom: 16 },
  card: { background: "#fff", borderRadius: 12, padding: "12px 12px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { display: "block", fontSize: 12, color: "#6B7280", marginBottom: 4, fontWeight: 600 },
  miniLabel: { display: "block", fontSize: 11, color: "#9CA3AF", marginBottom: 3 },
  input: { width: "100%", padding: "10px 12px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", boxSizing: "border-box", color: "#1F2937" },
  btnPrimary: { background: "#2C3E50", color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 },
  btnSecondary: { background: "#F3F4F6", color: "#374151", border: "1.5px solid #D1D5DB", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  btnGhost: { background: "transparent", color: "#2C3E50", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  btnDanger: { background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  toggleWrap: { display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 2, gap: 2, alignSelf: "flex-start" },
  toggleBtn: { fontSize: 12, padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, background: "transparent", color: "#6B7280", transition: "all 0.15s" },
  toggleBtnActive: { background: "#2C3E50", color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" },
  nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-around", padding: "8px 0 12px", zIndex: 100 },
  navBtn: { background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", padding: "4px 8px" },
  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "nowrap", padding: "6px 0", borderBottom: "1px solid #F3F4F6", fontSize: 14, color: "#4B5563", whiteSpace: "nowrap" },
  totalLine: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13, color: "#4B5563", lineHeight: 1.4, flexWrap: "nowrap" },
  totalLineBig: { display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 17, fontWeight: 800, color: "#2C3E50", lineHeight: 1.4 },
  totalLabel: { fontSize: 13, color: "#4B5563", padding: "5px 0", borderBottom: "1px solid #F3F4F6" },
  totalValue: { fontSize: 13, color: "#4B5563", padding: "5px 0", borderBottom: "1px solid #F3F4F6", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  totalLabelBig: { fontSize: 16, fontWeight: 800, color: "#2C3E50", borderBottom: "none", paddingTop: 10 },
  totalValueBig: { fontSize: 16, fontWeight: 800, color: "#2C3E50", borderBottom: "none", paddingTop: 10 },
  grandTotal: { borderBottom: "none", fontWeight: 800, fontSize: 18, color: "#2C3E50", paddingTop: 10 },
  itemRow: { background: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 10, border: "1px solid #E5E7EB" },
  removeBtn: { background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" },
  itemCalc: { display: "flex", gap: 8, marginTop: 8, fontSize: 12, color: "#6B7280", flexWrap: "wrap", alignItems: "center" },
  calcChipMuted: { background: "#F3F4F6", color: "#6B7280", borderRadius: 4, padding: "2px 7px" },
  calcChipTotal: { background: "#2C3E50", color: "#fff", borderRadius: 4, padding: "2px 8px", fontWeight: 800, marginLeft: "auto" },
  archiveCard: { background: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #F3F4F6" },
  archiveNo: { fontSize: 12, color: "#6B7280", fontWeight: 700 },
  archiveClient: { fontSize: 15, fontWeight: 700, color: "#1F2937", marginTop: 2 },
  archiveSub: { fontSize: 13, color: "#4B5563", marginTop: 2 },
  archiveMeta: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  archiveAmount: { fontSize: 16, fontWeight: 800, color: "#2C3E50", marginTop: 6 },
  statusBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, color: "#fff", fontSize: 11, fontWeight: 700 },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  statCard: { background: "#fff", borderRadius: 12, padding: 16, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  statNum: { fontSize: 28, fontWeight: 800, color: "#2C3E50" },
  statLabel: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  recentTitle: { fontSize: 13, fontWeight: 700, color: "#6B7280", marginBottom: 8, marginTop: 4 },
  backBtn: { background: "none", border: "none", color: "#2563EB", fontSize: 14, cursor: "pointer", padding: "4px 0" },
  empty: { textAlign: "center", padding: "60px 20px", color: "#9CA3AF" },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#2C3E50", color: "#fff", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" },
  // Preview: scale A4 (794px wide) down to fit within 448px container
  previewOuter: { width: "100%", background: "#e5e7eb", borderRadius: 8, padding: 12, overflowX: "hidden" },
  previewScaler: { transformOrigin: "top left", transform: "scale(0.56)", width: "794px", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" },
};

// A4 print/preview styles (px-based for screen, mm-based handled by @page in print)
const A4 = {
  page: { width: "794px", minHeight: "1123px", padding: "72px 64px", background: "#fff", boxSizing: "border-box", fontFamily: "'Hiragino Kaku Gothic ProN','Meiryo',sans-serif", fontSize: "14px", color: "#1a1a1a" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #2C3E50", paddingBottom: 20, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 900, color: "#1a1a1a", letterSpacing: 8 },
  metaRight: { textAlign: "right", fontSize: 12, lineHeight: 2, color: "#444" },
  twoCol: { display: "flex", gap: 28, marginBottom: 20 },
  clientBox: { flex: 1 },
  clientName: { fontSize: 18, fontWeight: 800, borderBottom: "2px solid #2C3E50", paddingBottom: 4, marginBottom: 6 },
  clientSub: { fontSize: 12, color: "#555", lineHeight: 1.7 },
  subject: { marginTop: 10, fontSize: 14, fontWeight: 700 },
  issuerBox: { flex: 1, textAlign: "right" },
  issuerName: { fontSize: 16, fontWeight: 800, marginBottom: 4 },
  issuerSub: { fontSize: 11, color: "#555", lineHeight: 1.9 },
  totalBanner: { background: "#2C3E50", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderRadius: 4, marginBottom: 20 },
  totalAmount: { fontSize: 22, fontWeight: 900 },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 20 },
  th: { background: "#F3F4F6", border: "1px solid #D1D5DB", padding: "7px 9px", fontSize: 12, textAlign: "center", fontWeight: 700, color: "#374151" },
  td: { border: "1px solid #E5E7EB", padding: "7px 9px", fontSize: 12, verticalAlign: "middle" },
  summaryRow: { display: "flex", gap: 24, alignItems: "flex-start" },
  noteBox: { flex: 1 },
  noteTitle: { fontWeight: 700, fontSize: 12, color: "#6B7280", marginBottom: 4 },
  noteText: { fontSize: 11, lineHeight: 1.8, color: "#4B5563" },
  calcBox: { width: "220px", border: "1px solid #E5E7EB", borderRadius: 4, overflow: "hidden" },
  calcRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", padding: "6px 12px", fontSize: 12, borderBottom: "1px solid #F3F4F6" },
  calcTotal: { display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#2C3E50", color: "#fff", fontSize: 14, fontWeight: 800 },
  bankSection: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #E5E7EB" },
};
