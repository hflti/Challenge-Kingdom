import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Baby,
  Check,
  Crown,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { accountsApi, type FamilyMember, type FamilySummary, type MemberRole } from "../lib/account-api";

type AdminConsoleProps = { onClose: () => void };

const emptyMember = { role: "child" as MemberRole, name: "", code: "", grade: "", title: "", quote: "", color: "#ea4b5e" };
const memberColors = ["#ea4b5e", "#e58a46", "#6d6aac", "#34866a", "#3677a7", "#a8577d"];
const codeIsValid = (value: string) => value.length >= 4 && value.length <= 64;

export function AdminConsole({ onClose }: AdminConsoleProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState("");
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<FamilySummary | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [newFamily, setNewFamily] = useState({ name: "", code: "" });
  const [newMember, setNewMember] = useState(emptyMember);
  const [familyCode, setFamilyCode] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [adminCodes, setAdminCodes] = useState({ currentCode: "", newCode: "" });
  const [memberCode, setMemberCode] = useState<Record<string, string>>({});
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [showFamilySettings, setShowFamilySettings] = useState(false);
  const [showAdminSecurity, setShowAdminSecurity] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);

  const owner = members.find((member) => member.role === "owner");
  const children = members.filter((member) => member.role === "child");
  const filteredFamilies = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("ar");
    return value ? families.filter((family) => family.name.toLocaleLowerCase("ar").includes(value)) : families;
  }, [families, search]);

  const beginAction = () => {
    setLoading(true);
    setError("");
    setNotice("");
  };

  const showFailure = (cause: unknown, fallback: string) => {
    setError(cause instanceof Error ? cause.message : fallback);
  };

  const loadFamilies = async (sessionToken = token) => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const result = await accountsApi.adminFamilies(sessionToken);
      setFamilies(result.families);
      setSelectedFamily((current) => result.families.find((family) => family.id === current?.id) ?? null);
    } catch (cause) {
      showFailure(cause, "تعذر تحميل الممالك.");
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (family: FamilySummary, sessionToken = token) => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const result = await accountsApi.adminMembers(sessionToken, family.id);
      const currentFamily = { ...family, name: result.family.name };
      setSelectedFamily(currentFamily);
      setFamilyName(currentFamily.name);
      setMembers(result.members);
      setMemberCode({});
    } catch (cause) {
      showFailure(cause, "تعذر تحميل ملفات المملكة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void loadFamilies(token);
  }, [token]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    beginAction();
    try {
      const session = await accountsApi.adminLogin(loginCode);
      setLoginCode("");
      setToken(session.token);
    } catch (cause) {
      showFailure(cause, "تعذر تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  };

  const createFamily = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const name = newFamily.name.trim();
    if (!name) {
      setError("اكتب اسم المملكة.");
      return;
    }
    if (!codeIsValid(newFamily.code)) {
      setError("رمز المملكة يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    beginAction();
    try {
      const result = await accountsApi.createFamily(token, name, newFamily.code);
      const created = { ...result.family, memberCount: 0 };
      setNewFamily({ name: "", code: "" });
      setShowCreateFamily(false);
      setNotice("تم إنشاء المملكة. الخطوة التالية: إضافة ولي الأمر.");
      await loadFamilies(token);
      await loadMembers(created, token);
    } catch (cause) {
      showFailure(cause, "تعذر إنشاء المملكة.");
    } finally {
      setLoading(false);
    }
  };

  const createMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    if (!newMember.name.trim()) {
      setError("اكتب اسم العضو.");
      return;
    }
    if (!codeIsValid(newMember.code)) {
      setError("رمز العضو يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    beginAction();
    try {
      await accountsApi.createMember(token, {
        familyId: selectedFamily.id,
        role: newMember.role,
        name: newMember.name.trim(),
        code: newMember.code,
        ...(newMember.grade.trim() ? { grade: newMember.grade.trim() } : {}),
        ...(newMember.title.trim() ? { title: newMember.title.trim() } : {}),
        ...(newMember.quote.trim() ? { quote: newMember.quote.trim() } : {}),
        ...(newMember.color.trim() ? { color: newMember.color.trim() } : {}),
      });
      setNewMember(emptyMember);
      setShowMemberForm(false);
      setNotice(newMember.role === "owner" ? "تمت إضافة ولي الأمر." : "تمت إضافة ملف الطفل بكل ميزات التحديات والمكافآت.");
      await loadMembers(selectedFamily, token);
      await loadFamilies(token);
    } catch (cause) {
      showFailure(cause, "تعذرت إضافة العضو.");
    } finally {
      setLoading(false);
    }
  };

  const openMemberForm = (role: MemberRole) => {
    setNewMember({ ...emptyMember, role });
    setError("");
    setNotice("");
    setShowMemberForm(true);
  };

  const deleteMember = async (member: FamilyMember) => {
    if (!token || !selectedFamily || !window.confirm(`سيُحذف ${member.name} وكل تقدمه ومهامه وتحدياته النشطة نهائياً. هل تريد المتابعة؟`)) return;
    beginAction();
    try {
      await accountsApi.deleteMember(token, selectedFamily.id, member.id);
      setNotice(`تم حذف ${member.name} نهائياً.`);
      await loadMembers(selectedFamily, token);
      await loadFamilies(token);
    } catch (cause) {
      showFailure(cause, "تعذر حذف العضو.");
    } finally {
      setLoading(false);
    }
  };

  const rotateMemberCode = async (member: FamilyMember) => {
    const newCode = memberCode[member.id] ?? "";
    if (!token || !selectedFamily) return;
    if (!codeIsValid(newCode)) {
      setError("الرمز الجديد يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    beginAction();
    try {
      await accountsApi.changeMemberCode(token, selectedFamily.id, member.id, newCode);
      setMemberCode((current) => ({ ...current, [member.id]: "" }));
      setNotice(`تم تغيير رمز ${member.name} وإبطال جلساته القديمة.`);
    } catch (cause) {
      showFailure(cause, "تعذر تغيير الرمز.");
    } finally {
      setLoading(false);
    }
  };

  const rotateFamilyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    if (!codeIsValid(familyCode)) {
      setError("رمز المملكة يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    beginAction();
    try {
      await accountsApi.changeFamilyCode(token, selectedFamily.id, familyCode);
      setFamilyCode("");
      setNotice("تم تغيير رمز المملكة ونقل التقدم وإبطال جلسات الرمز القديم.");
    } catch (cause) {
      showFailure(cause, "تعذر تغيير رمز المملكة.");
    } finally {
      setLoading(false);
    }
  };

  const renameFamily = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily || !familyName.trim()) return;
    beginAction();
    try {
      await accountsApi.changeFamilyName(token, selectedFamily.id, familyName.trim());
      const renamed = { ...selectedFamily, name: familyName.trim() };
      setSelectedFamily(renamed);
      setFamilies((current) => current.map((family) => family.id === renamed.id ? renamed : family));
      setNotice("تم تحديث اسم المملكة.");
    } catch (cause) {
      showFailure(cause, "تعذر تحديث اسم المملكة.");
    } finally {
      setLoading(false);
    }
  };

  const deleteFamily = async () => {
    if (!token || !selectedFamily || !window.confirm(`سيتم حذف مملكة «${selectedFamily.name}» وكل ملفاتها وتقدمها نهائياً. لا يمكن التراجع. هل تريد المتابعة؟`)) return;
    beginAction();
    try {
      await accountsApi.deleteFamily(token, selectedFamily.id);
      setSelectedFamily(null);
      setMembers([]);
      setShowFamilySettings(false);
      setNotice("تم حذف المملكة وكل بياناتها نهائياً.");
      await loadFamilies(token);
    } catch (cause) {
      showFailure(cause, "تعذر حذف المملكة.");
    } finally {
      setLoading(false);
    }
  };

  const rotateAdminCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!codeIsValid(adminCodes.currentCode) || !codeIsValid(adminCodes.newCode)) {
      setError("أدخل الرمز الحالي ورمزاً جديداً من 4 إلى 64 حرفاً.");
      return;
    }
    beginAction();
    try {
      await accountsApi.changeAdminCode(token, adminCodes.currentCode, adminCodes.newCode);
      setAdminCodes({ currentCode: "", newCode: "" });
      setToken(null);
      setNotice("تم تغيير رمز الأدمن. سجّل الدخول بالرمز الجديد.");
    } catch (cause) {
      showFailure(cause, "تعذر تغيير رمز الأدمن.");
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrent = async () => {
    if (selectedFamily) await loadMembers(selectedFamily);
    await loadFamilies();
  };

  const logout = () => {
    setToken(null);
    setSelectedFamily(null);
    setMembers([]);
    setAdminCodes({ currentCode: "", newCode: "" });
    onClose();
  };

  if (!token) {
    return (
      <main className="admin-login-wrapper" dir="rtl">
        <section className="admin-login-box" aria-labelledby="admin-login-title" data-testid="panel-admin-login">
          <div className="admin-icon"><ShieldCheck size={39} aria-hidden="true" /></div>
          <span className="admin-login-kicker">مركز إدارة مملكة التحديات</span>
          <h1 className="admin-title" id="admin-login-title">دخول الأدمن</h1>
          <p className="admin-login-copy">أنشئ الممالك، عيّن ولي الأمر، وأدر ملفات الأطفال من مكان واحد آمن.</p>
          {notice && <p className="status-message success" role="status" data-testid="status-admin-notice">{notice}</p>}
          {error && <p className="status-message error" role="alert" data-testid="status-admin-error">{error}</p>}
          <form className="admin-login-form" onSubmit={login}>
            <label htmlFor="admin-code">رمز الأدمن</label>
            <input id="admin-code" className="admin-input code-input" data-testid="input-admin-code" type="password" value={loginCode} onChange={(event) => setLoginCode(event.target.value)} autoComplete="current-password" required />
            <button className="admin-btn primary full-width" data-testid="button-admin-login" disabled={loading}>{loading ? "جارٍ التحقق…" : "دخول آمن"}</button>
          </form>
          <button className="admin-btn outline-dark full-width" data-testid="button-admin-back" type="button" onClick={onClose}>العودة للتطبيق</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-dashboard" dir="rtl" aria-labelledby="admin-title" data-testid="panel-admin-dashboard">
      <aside className="admin-sidebar">
        <header className="admin-sidebar-header">
          <div className="admin-logo"><Crown size={25} /><span id="admin-title">لوحة الممالك</span></div>
          <div className="admin-header-actions">
            <button className="icon-button" data-testid="button-admin-refresh" type="button" onClick={() => void refreshCurrent()} aria-label="تحديث البيانات"><RefreshCcw size={19} /></button>
            <button className="icon-button" data-testid="button-admin-logout" type="button" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={19} /></button>
          </div>
        </header>

        <button className="admin-btn primary admin-create-kingdom" data-testid="button-open-create-family" type="button" onClick={() => setShowCreateFamily(true)}><Plus size={17} /> إضافة مملكة جديدة</button>

        <label className="admin-search-bar">
          <span className="sr-only">البحث عن مملكة</span>
          <input data-testid="input-search-families" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم المملكة" />
          <Search size={17} aria-hidden="true" />
        </label>

        <nav className="admin-kingdoms-list" aria-label="قائمة الممالك">
          {loading && families.length === 0 && <p className="admin-sidebar-note">جارٍ تحميل الممالك…</p>}
          {!loading && filteredFamilies.length === 0 && <p className="admin-sidebar-note">{search ? "لا توجد نتائج مطابقة." : "لا توجد ممالك بعد. ابدأ بإضافة مملكة."}</p>}
          {filteredFamilies.map((family) => (
            <button
              className={`kingdom-list-item ${selectedFamily?.id === family.id ? "active" : ""}`}
              data-testid={`button-family-${family.id}`}
              type="button"
              key={family.id}
              aria-pressed={selectedFamily?.id === family.id}
              onClick={() => void loadMembers(family)}
            >
              <span className="kingdom-name">{family.name}</span>
              <span className="kingdom-meta">{family.memberCount} أعضاء • {family.memberCount > 0 ? "نشطة" : "تحتاج ولي أمر"}</span>
            </button>
          ))}
        </nav>

        <footer className="admin-sidebar-footer">
          <button className="admin-btn outline full-width" data-testid="button-open-admin-security" type="button" onClick={() => setShowAdminSecurity(true)}><KeyRound size={17} /> تغيير رمز الأدمن</button>
        </footer>
      </aside>

      <section className="admin-content">
        <div className="admin-content-inner">
          {error && <p className="status-message error" role="alert" data-testid="status-admin-error">{error}</p>}
          {notice && <p className="status-message success" role="status" data-testid="status-admin-notice">{notice}</p>}

          {!selectedFamily ? (
            <div className="admin-empty-state" data-testid="empty-admin-family">
              <Crown aria-hidden="true" />
              <h2>ابدأ بمملكة جديدة</h2>
              <p>أضف اسم المملكة ورمز ربط الأجهزة، ثم أنشئ ملف ولي الأمر وأضف الأطفال.</p>
              <button className="admin-btn primary" type="button" data-testid="button-create-first-family" onClick={() => setShowCreateFamily(true)}><Plus size={17} /> إنشاء أول مملكة</button>
            </div>
          ) : (
            <>
              <header className="kingdom-detail-header">
                <div className="kingdom-title-group">
                  <span className="admin-kingdom-mark"><Crown size={25} /></span>
                  <div>
                    <span className="admin-kicker">المملكة المحددة</span>
                    <h2 data-testid="text-selected-family-name">{selectedFamily.name}</h2>
                    <p>{children.length} أطفال • {owner ? `ولي الأمر: ${owner.name}` : "لم يُضف ولي الأمر بعد"}</p>
                  </div>
                </div>
                <div className="kingdom-actions">
                  <button className="admin-btn outline-dark" type="button" data-testid="button-open-family-settings" onClick={() => setShowFamilySettings(true)}><Pencil size={16} /> إدارة المملكة</button>
                </div>
              </header>

              <div className="admin-info-banner" data-testid="panel-feature-assurance">
                <Sparkles size={21} />
                <p><strong>كل طفل تضيفه يحصل تلقائياً على كامل التجربة:</strong> التحديات، المؤقت والاستراحة، النقاط والمكافآت، الخريطة، المهام المخصصة، والتحقق بواسطة ولي الأمر. رمز المملكة يربط الأجهزة، أما رمز ولي الأمر فيحمي أوامر الوالدين.</p>
              </div>

              <section className="admin-section" aria-labelledby="owner-section-title">
                <div className="admin-section-header">
                  <div><span className="admin-kicker">صلاحيات الوالدين</span><h3 id="owner-section-title">ولي الأمر</h3></div>
                  {!owner && <button className="admin-btn primary" type="button" data-testid="button-add-owner" onClick={() => openMemberForm("owner")}><Plus size={16} /> إضافة ولي الأمر</button>}
                </div>
                {owner ? <MemberCard member={owner} familyId={selectedFamily.id} code={memberCode[owner.id] ?? ""} loading={loading} onCodeChange={(value) => setMemberCode((current) => ({ ...current, [owner.id]: value }))} onRotate={() => void rotateMemberCode(owner)} onDelete={() => void deleteMember(owner)} /> :
                  <div className="admin-owner-empty" data-testid="empty-owner"><UserRound size={35} /><div><strong>المملكة تحتاج ولي أمر</strong><p>ولي الأمر هو المسؤول عن التحديات والمكافآت والتحقق، وله رمز مستقل عن رمز المملكة.</p></div></div>}
              </section>

              <section className="admin-section" aria-labelledby="children-section-title">
                <div className="admin-section-header">
                  <div><span className="admin-kicker">ملفات الأبطال</span><h3 id="children-section-title">الأطفال</h3></div>
                  <button className="admin-btn primary" type="button" data-testid="button-add-child" onClick={() => openMemberForm("child")}><Plus size={16} /> إضافة طفل</button>
                </div>
                {children.length === 0 ? <div className="admin-owner-empty" data-testid="empty-children"><Baby size={35} /><div><strong>لا توجد ملفات أطفال بعد</strong><p>أضف الطفل ليظهر ملفه مباشرة في شاشة الأبطال مع كامل الميزات.</p></div></div> :
                  <div className="admin-grid">{children.map((child) => <MemberCard key={child.id} member={child} familyId={selectedFamily.id} code={memberCode[child.id] ?? ""} loading={loading} onCodeChange={(value) => setMemberCode((current) => ({ ...current, [child.id]: value }))} onRotate={() => void rotateMemberCode(child)} onDelete={() => void deleteMember(child)} />)}</div>}
              </section>
            </>
          )}
        </div>
      </section>

      {showCreateFamily && (
        <Modal title="إضافة مملكة جديدة" onClose={() => setShowCreateFamily(false)} testId="modal-create-family">
          <p className="admin-modal-copy">اكتب اسماً واضحاً للمملكة ورمزاً خاصاً لربط أجهزة الأسرة. لن يُعرض الرمز بعد الحفظ.</p>
          <form onSubmit={createFamily}>
            <label className="admin-field"><span>اسم المملكة</span><input className="admin-input" data-testid="input-new-family-name" maxLength={80} value={newFamily.name} onChange={(event) => setNewFamily({ ...newFamily, name: event.target.value })} placeholder="مثال: مملكة عائلة أحمد" required /></label>
            <label className="admin-field"><span>رمز المملكة</span><input className="admin-input code-input" data-testid="input-new-family-code" type="password" minLength={4} maxLength={64} value={newFamily.code} onChange={(event) => setNewFamily({ ...newFamily, code: event.target.value })} placeholder="4 أحرف أو أرقام على الأقل" autoComplete="new-password" required /><small>يستخدمه ولي الأمر لربط هواتف وأجهزة الأسرة.</small></label>
            <div className="admin-form-actions"><button className="admin-btn outline-dark" type="button" data-testid="button-cancel-create-family" onClick={() => setShowCreateFamily(false)}>إلغاء</button><button className="admin-btn primary" data-testid="button-submit-create-family" disabled={loading}><Check size={16} /> إنشاء المملكة</button></div>
          </form>
        </Modal>
      )}

      {showMemberForm && selectedFamily && (
        <Modal title={newMember.role === "owner" ? "إضافة ولي الأمر" : "إضافة ملف طفل"} onClose={() => setShowMemberForm(false)} testId="modal-create-member">
          <form onSubmit={createMember}>
            <label className="admin-field"><span>{newMember.role === "owner" ? "اسم ولي الأمر" : "اسم الطفل"}</span><input className="admin-input" data-testid="input-new-member-name" maxLength={120} value={newMember.name} onChange={(event) => setNewMember({ ...newMember, name: event.target.value })} required /></label>
            <label className="admin-field"><span>الرمز الخاص</span><input className="admin-input code-input" data-testid="input-new-member-code" type="password" minLength={4} maxLength={64} value={newMember.code} onChange={(event) => setNewMember({ ...newMember, code: event.target.value })} autoComplete="new-password" required /><small>{newMember.role === "owner" ? "يحمي أوامر التحديات والمكافآت والإدارة العائلية." : "يستخدمه الطفل لفتح ملفه فقط."}</small></label>
            {newMember.role === "child" && <>
              <div className="admin-form-row"><label className="admin-field"><span>الصف</span><input className="admin-input" data-testid="input-new-member-grade" maxLength={120} value={newMember.grade} onChange={(event) => setNewMember({ ...newMember, grade: event.target.value })} placeholder="مثال: الصف الرابع" /></label><label className="admin-field"><span>اللقب</span><input className="admin-input" data-testid="input-new-member-title" maxLength={120} value={newMember.title} onChange={(event) => setNewMember({ ...newMember, title: event.target.value })} placeholder="مثال: فارس الأرقام" /></label></div>
              <label className="admin-field"><span>عبارة الطفل</span><input className="admin-input" data-testid="input-new-member-quote" maxLength={500} value={newMember.quote} onChange={(event) => setNewMember({ ...newMember, quote: event.target.value })} placeholder="عبارة تشجيعية تظهر في ملفه" /></label>
              <fieldset className="admin-field"><legend>لون الملف</legend><div className="admin-color-picker">{memberColors.map((color) => <button className={`admin-color-btn ${newMember.color === color ? "selected" : ""}`} data-testid={`button-member-color-${color.slice(1)}`} type="button" key={color} style={{ background: color }} aria-label={`اختيار اللون ${color}`} aria-pressed={newMember.color === color} onClick={() => setNewMember({ ...newMember, color })} />)}</div></fieldset>
            </>}
            <div className="admin-form-actions"><button className="admin-btn outline-dark" type="button" data-testid="button-cancel-create-member" onClick={() => setShowMemberForm(false)}>إلغاء</button><button className="admin-btn primary" data-testid="button-submit-create-member" disabled={loading}><Check size={16} /> {newMember.role === "owner" ? "حفظ ولي الأمر" : "إضافة الطفل"}</button></div>
          </form>
        </Modal>
      )}

      {showFamilySettings && selectedFamily && (
        <Modal title={`إدارة ${selectedFamily.name}`} onClose={() => setShowFamilySettings(false)} testId="modal-family-settings">
          <form className="admin-settings-block" onSubmit={renameFamily}>
            <h4>اسم المملكة</h4>
            <div className="admin-member-code-row"><input className="admin-input" data-testid="input-family-name" maxLength={80} value={familyName} onChange={(event) => setFamilyName(event.target.value)} required /><button className="admin-btn outline-dark" data-testid="button-save-family-name" disabled={loading}>حفظ الاسم</button></div>
          </form>
          <form className="admin-settings-block" onSubmit={rotateFamilyCode}>
            <h4>رمز المملكة</h4>
            <p>تغييره ينقل التقدم إلى الرمز الجديد ويلغي عمل الرمز القديم.</p>
            <div className="admin-member-code-row"><input className="admin-input code-input" data-testid="input-family-new-code" type="password" minLength={4} maxLength={64} value={familyCode} onChange={(event) => setFamilyCode(event.target.value)} placeholder="الرمز الجديد" autoComplete="new-password" required /><button className="admin-btn outline-dark" data-testid="button-change-family-code" disabled={loading}><KeyRound size={15} /> تغيير الرمز</button></div>
          </form>
          <div className="admin-settings-block danger-zone">
            <h4>حذف المملكة نهائياً</h4>
            <p>يحذف ولي الأمر والأطفال وكل النقاط والمهام والتحديات النشطة.</p>
            <button className="admin-btn danger full-width" data-testid="button-delete-family" type="button" disabled={loading} onClick={() => void deleteFamily()}><Trash2 size={16} /> حذف المملكة وكل بياناتها</button>
          </div>
        </Modal>
      )}

      {showAdminSecurity && (
        <Modal title="تغيير رمز الأدمن" onClose={() => setShowAdminSecurity(false)} testId="modal-admin-security">
          <p className="admin-modal-copy">هذه الأداة مخفية عن لوحة العمل الرئيسية. بعد التغيير ستنتهي جلسة الأدمن الحالية.</p>
          <form onSubmit={rotateAdminCode}>
            <label className="admin-field"><span>رمز الأدمن الحالي</span><input className="admin-input code-input" data-testid="input-current-admin-code" type="password" value={adminCodes.currentCode} onChange={(event) => setAdminCodes({ ...adminCodes, currentCode: event.target.value })} autoComplete="current-password" required /></label>
            <label className="admin-field"><span>رمز الأدمن الجديد</span><input className="admin-input code-input" data-testid="input-new-admin-code" type="password" minLength={4} maxLength={64} value={adminCodes.newCode} onChange={(event) => setAdminCodes({ ...adminCodes, newCode: event.target.value })} autoComplete="new-password" required /></label>
            <div className="admin-form-actions"><button className="admin-btn outline-dark" type="button" data-testid="button-cancel-admin-code" onClick={() => setShowAdminSecurity(false)}>إلغاء</button><button className="admin-btn primary" data-testid="button-change-admin-code" disabled={loading}><KeyRound size={16} /> تغيير رمز الأدمن</button></div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function Modal({ title, onClose, testId, children }: { title: string; onClose: () => void; testId: string; children: React.ReactNode }) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <header className="admin-modal-header"><h3>{title}</h3><button className="admin-modal-close" data-testid={`button-close-${testId}`} type="button" onClick={onClose} aria-label="إغلاق"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

function MemberCard({
  member,
  familyId,
  code,
  loading,
  onCodeChange,
  onRotate,
  onDelete,
}: {
  member: FamilyMember;
  familyId: string;
  code: string;
  loading: boolean;
  onCodeChange: (value: string) => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const isOwner = member.role === "owner";
  return (
    <article className={`admin-member-card ${isOwner ? "owner-card" : ""}`} data-testid={`card-member-${member.id}`}>
      <header className="admin-member-header">
        <span className="admin-member-avatar" style={{ background: member.color || (isOwner ? "#39355b" : "#ea4b5e") }}>{isOwner ? <UserRound size={24} /> : member.name.slice(0, 1)}</span>
        <div className="admin-member-info"><span className="admin-role-badge">{isOwner ? "ولي الأمر" : "طفل"}</span><h4 data-testid={`text-member-name-${member.id}`}>{member.name}</h4><p>{isOwner ? "مسؤول التحديات والمكافآت والتحقق" : [member.grade, member.title].filter(Boolean).join(" • ") || "ملف بطل جاهز"}</p></div>
      </header>
      {member.quote && <blockquote>{member.quote}</blockquote>}
      <div className="admin-member-actions">
        <label htmlFor={`member-code-${familyId}-${member.id}`}>تغيير الرمز الخاص</label>
        <div className="admin-member-code-row"><input id={`member-code-${familyId}-${member.id}`} className="admin-input code-input" data-testid={`input-member-code-${member.id}`} type="password" minLength={4} maxLength={64} value={code} onChange={(event) => onCodeChange(event.target.value)} placeholder="رمز جديد" autoComplete="new-password" /><button className="admin-btn outline-dark" data-testid={`button-change-member-code-${member.id}`} type="button" disabled={loading} onClick={onRotate}><KeyRound size={15} /> تغيير</button></div>
        <button className="admin-btn danger" data-testid={`button-delete-member-${member.id}`} type="button" disabled={loading} onClick={onDelete}><Trash2 size={15} /> حذف {isOwner ? "ولي الأمر" : "ملف الطفل"}</button>
      </div>
    </article>
  );
}