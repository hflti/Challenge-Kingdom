import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, RefreshCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { accountsApi, type FamilyMember, type FamilySummary, type MemberRole } from "../lib/account-api";

type AdminConsoleProps = { onClose: () => void };

const codeIsValid = (value: string) => value.length >= 4 && value.length <= 64;

export function AdminConsole({ onClose }: AdminConsoleProps) {
  // Deliberately state-only: this short-lived credential is never written to browser storage.
  const [token, setToken] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState("");
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<FamilySummary | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newMember, setNewMember] = useState({ role: "child" as MemberRole, name: "", code: "", grade: "", title: "", quote: "", color: "" });
  const [familyCode, setFamilyCode] = useState("");
  const [adminCodes, setAdminCodes] = useState({ currentCode: "", newCode: "" });
  const [memberCode, setMemberCode] = useState<Record<string, string>>({});

  const loadFamilies = async (sessionToken = token) => {
    if (!sessionToken) return;
    setLoading(true); setError("");
    try {
      const result = await accountsApi.adminFamilies(sessionToken);
      setFamilies(result.families);
      setSelectedFamily((current) => result.families.find((item) => item.id === current?.id) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الممالك.");
    } finally { setLoading(false); }
  };

  const loadMembers = async (family: FamilySummary, sessionToken = token) => {
    if (!sessionToken) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await accountsApi.adminMembers(sessionToken, family.id);
      setSelectedFamily({ ...family, name: result.family.name });
      setMembers(result.members);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الأعضاء.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) void loadFamilies(token); }, [token]);

  const login = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const session = await accountsApi.adminLogin(loginCode);
      setLoginCode(""); setToken(session.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول.");
    } finally { setLoading(false); }
  };

  const refreshCurrent = async () => {
    if (selectedFamily) await loadMembers(selectedFamily);
    await loadFamilies();
  };
  const createMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    if (!codeIsValid(newMember.code)) { setError("رمز العضو يجب أن يتكون من 4 إلى 64 حرفاً."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      await accountsApi.createMember(token, {
        familyId: selectedFamily.id, role: newMember.role, name: newMember.name.trim(), code: newMember.code,
        ...(newMember.grade.trim() ? { grade: newMember.grade.trim() } : {}),
        ...(newMember.title.trim() ? { title: newMember.title.trim() } : {}),
        ...(newMember.quote.trim() ? { quote: newMember.quote.trim() } : {}),
        ...(newMember.color.trim() ? { color: newMember.color.trim() } : {}),
      });
      setNewMember({ role: "child", name: "", code: "", grade: "", title: "", quote: "", color: "" });
      setNotice("تمت إضافة العضو. احتفظ بالرمز خارج المتصفح.");
      await loadMembers(selectedFamily);
      await loadFamilies();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذرت إضافة العضو."); }
    finally { setLoading(false); }
  };
  const deleteMember = async (member: FamilyMember) => {
    if (!token || !selectedFamily || !window.confirm(`سيُحذف ${member.name} وكل تقدمه نهائياً. هل تريد المتابعة؟`)) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await accountsApi.deleteMember(token, selectedFamily.id, member.id);
      setNotice("تم الحذف النهائي.");
      await loadMembers(selectedFamily); await loadFamilies();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حذف العضو."); }
    finally { setLoading(false); }
  };
  const rotateMemberCode = async (member: FamilyMember) => {
    const newCode = memberCode[member.id] ?? "";
    if (!token || !selectedFamily) return;
    if (!codeIsValid(newCode)) { setError("الرمز الجديد يجب أن يتكون من 4 إلى 64 حرفاً."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      await accountsApi.changeMemberCode(token, selectedFamily.id, member.id, newCode);
      setMemberCode((current) => ({ ...current, [member.id]: "" })); setNotice("تم تغيير رمز العضو.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تغيير الرمز."); }
    finally { setLoading(false); }
  };
  const rotateFamilyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    if (!codeIsValid(familyCode)) { setError("رمز العائلة يجب أن يتكون من 4 إلى 64 حرفاً."); return; }
    setLoading(true); setError(""); setNotice("");
    try { await accountsApi.changeFamilyCode(token, selectedFamily.id, familyCode); setFamilyCode(""); setNotice("تم تغيير رمز العائلة."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تغيير رمز العائلة."); }
    finally { setLoading(false); }
  };
  const rotateAdminCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!codeIsValid(adminCodes.newCode)) { setError("الرمز الجديد يجب أن يتكون من 4 إلى 64 حرفاً."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      await accountsApi.changeAdminCode(token, adminCodes.currentCode, adminCodes.newCode);
      setAdminCodes({ currentCode: "", newCode: "" }); setToken(null);
      setNotice("تم تغيير رمز المدير. سجّل الدخول بالرمز الجديد.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تغيير رمز المدير."); }
    finally { setLoading(false); }
  };

  if (!token) return <section className="family-sync-card" dir="rtl" aria-labelledby="admin-login-title" data-testid="panel-admin-login">
    <ShieldCheck size={40} aria-hidden="true" />
    <h1 id="admin-login-title" className="display-title">دخول الإدارة</h1>
    <p>للاسترداد اليدوي فقط. لا تُعرض أي معلومات اتصال عامة هنا.</p>
    {notice && <p role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    <form onSubmit={login}><label htmlFor="admin-code">رمز المدير</label><input id="admin-code" className="code-input" type="password" value={loginCode} onChange={(event) => setLoginCode(event.target.value)} autoComplete="current-password" required />
      <button className="primary-button" disabled={loading}>{loading ? "جارٍ التحقق…" : "دخول آمن"}</button></form>
    <button className="outline-button" onClick={onClose}>عودة</button>
  </section>;

  return <main className="profile-choose" dir="rtl" aria-labelledby="admin-title" data-testid="panel-admin-dashboard">
    <header className="choose-top"><div className="choose-logo"><ShieldCheck aria-hidden="true" /> <span id="admin-title">إدارة الممالك</span></div>
      <div><button className="icon-button" onClick={() => void refreshCurrent()} aria-label="تحديث البيانات"><RefreshCcw /></button><button className="icon-button" onClick={() => { setToken(null); onClose(); }} aria-label="تسجيل الخروج"><LogOut /></button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="home-grid section-block">
      <section className="panel"><h2 className="panel-title"><Users size={20} /> الممالك</h2>
        {loading && !families.length ? <p className="subtle">جارٍ التحميل…</p> : families.length === 0 ? <p className="subtle">لا توجد ممالك بعد.</p> :
          <div className="tiny-list">{families.map((family) => <button className="outline-button" key={family.id} onClick={() => void loadMembers(family)} aria-pressed={selectedFamily?.id === family.id}>{family.name} <small>({family.memberCount} أعضاء)</small></button>)}</div>}
      </section>
      <section className="panel"><h2 className="panel-title">رمز المدير</h2><form onSubmit={rotateAdminCode} className="tiny-list">
        <input className="code-input" type="password" placeholder="الرمز الحالي" value={adminCodes.currentCode} onChange={(e) => setAdminCodes({ ...adminCodes, currentCode: e.target.value })} required />
        <input className="code-input" type="password" placeholder="الرمز الجديد (4–64)" value={adminCodes.newCode} onChange={(e) => setAdminCodes({ ...adminCodes, newCode: e.target.value })} required />
        <button className="outline-button" disabled={loading}>تغيير رمز المدير</button></form></section>
    </div>
    {selectedFamily && <section className="section-block panel" aria-labelledby="family-admin-title">
      <h2 className="panel-title" id="family-admin-title">{selectedFamily.name}</h2>
      <div className="tiny-list">{members.length === 0 ? <p className="subtle">لا يوجد أعضاء في هذه العائلة.</p> : members.map((member) => <article className="mission-composer" key={member.id}>
        <strong>{member.name} — {member.role === "owner" ? "ولي الأمر" : "طفل"}</strong><span className="subtle">{member.grade || member.title || "لا توجد تفاصيل إضافية"}</span>
        <div className="composer-fields"><input className="code-input" type="password" aria-label={`رمز جديد للعضو ${member.name}`} placeholder="رمز جديد" value={memberCode[member.id] ?? ""} onChange={(e) => setMemberCode({ ...memberCode, [member.id]: e.target.value })} />
          <button className="outline-button" onClick={() => void rotateMemberCode(member)} disabled={loading}><KeyRound size={15} /> تغيير</button>
          <button className="outline-button" onClick={() => void deleteMember(member)} disabled={loading}><Trash2 size={15} /> حذف نهائي</button></div>
      </article>)}</div>
      <form onSubmit={createMember} className="mission-composer section-block" data-testid="form-admin-create-member"><h3>إضافة عضو</h3><div className="composer-fields">
        <select value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value as MemberRole })} aria-label="دور العضو"><option value="child">طفل</option><option value="owner">ولي الأمر</option></select>
        <input placeholder="الاسم" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} required />
        <input type="password" placeholder="رمز العضو (4–64)" value={newMember.code} onChange={(e) => setNewMember({ ...newMember, code: e.target.value })} required /></div>
        <div className="composer-fields"><input placeholder="الصف (اختياري)" value={newMember.grade} onChange={(e) => setNewMember({ ...newMember, grade: e.target.value })} /><input placeholder="اللقب (اختياري)" value={newMember.title} onChange={(e) => setNewMember({ ...newMember, title: e.target.value })} /><button className="primary-button" disabled={loading}>إضافة</button></div>
      </form>
      <form onSubmit={rotateFamilyCode} className="mission-composer"><h3>تغيير رمز العائلة</h3><p className="subtle">سيُنقل تقدم المملكة تلقائياً. لا يُحفظ الرمز في هذا المتصفح.</p><div className="composer-fields"><input className="code-input" type="password" placeholder="الرمز الجديد (4–64)" value={familyCode} onChange={(e) => setFamilyCode(e.target.value)} required /><button className="outline-button" disabled={loading}>تغيير رمز العائلة</button></div></form>
    </section>}
  </main>;
}