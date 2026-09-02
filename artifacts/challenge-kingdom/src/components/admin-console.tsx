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
import { defaultChildContent, normalizeChildContent, validateChildContent, type ChildContentConfig, type RewardKind } from "../lib/child-content";

type AdminConsoleProps = { initialToken: string; onClose: () => void };

const emptyMember = { role: "child" as MemberRole, name: "", grade: "", title: "", quote: "", color: "#ea4b5e" };
const memberColors = ["#ea4b5e", "#e58a46", "#6d6aac", "#34866a", "#3677a7", "#a8577d"];
const codeIsValid = (value: string) => value.length >= 4 && value.length <= 64;

export function AdminConsole({ initialToken, onClose }: AdminConsoleProps) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<FamilySummary | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [newFamily, setNewFamily] = useState({ name: "", username: "", code: "" });
  const [newMember, setNewMember] = useState(emptyMember);
  const [familyCode, setFamilyCode] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyUsername, setFamilyUsername] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [showFamilySettings, setShowFamilySettings] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showContentSettings, setShowContentSettings] = useState(false);
  const [childContent, setChildContent] = useState<ChildContentConfig>(defaultChildContent);

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
      const [result, contentResult] = await Promise.all([
        accountsApi.adminMembers(sessionToken, family.id),
        accountsApi.adminContent(sessionToken, family.id),
      ]);
      const currentFamily = { ...family, name: result.family.name };
      setSelectedFamily(currentFamily);
      setFamilyName(currentFamily.name);
      setFamilyUsername(currentFamily.username ?? "");
      setMembers(result.members);
      setChildContent(normalizeChildContent(contentResult.content));
    } catch (cause) {
      showFailure(cause, "تعذر تحميل ملفات المملكة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void loadFamilies(token);
  }, [token]);

  const createFamily = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const name = newFamily.name.trim();
    const username = newFamily.username.trim();
    if (!name) {
      setError("اكتب اسم المملكة.");
      return;
    }
    if (!codeIsValid(newFamily.code)) {
      setError("رمز المملكة يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    if (!/^[A-Za-z0-9]{3,64}$/.test(username)) {
      setError("اسم المستخدم يجب أن يتكون من أحرف إنجليزية وأرقام فقط.");
      return;
    }
    beginAction();
    try {
      const result = await accountsApi.createFamily(token, name, username, newFamily.code);
      const created = { ...result.family, memberCount: 0 };
      setNewFamily({ name: "", username: "", code: "" });
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
    beginAction();
    try {
      await accountsApi.createMember(token, {
        familyId: selectedFamily.id,
        role: newMember.role,
        name: newMember.name.trim(),
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

  const rotateFamilyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    if (!codeIsValid(familyCode)) {
      setError("الرمز الموحد يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    beginAction();
    try {
      await accountsApi.changeFamilyCode(token, selectedFamily.id, familyCode);
      setFamilyCode("");
      setNotice("تم تغيير الرمز الموحد ونقل التقدم وإبطال جلسات الرمز القديم.");
    } catch (cause) {
      showFailure(cause, "تعذر تغيير الرمز الموحد.");
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

  const updateFamilyUsername = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    const username = familyUsername.trim();
    if (!/^[A-Za-z0-9]{3,64}$/.test(username)) {
      setError("اسم المستخدم يجب أن يتكون من أحرف إنجليزية وأرقام فقط.");
      return;
    }
    beginAction();
    try {
      await accountsApi.changeFamilyUsername(token, selectedFamily.id, username);
      const updated = { ...selectedFamily, username: username.toLowerCase() };
      setSelectedFamily(updated);
      setFamilies((current) => current.map((family) => family.id === updated.id ? updated : family));
      setNotice("تم تحديث اسم مستخدم العائلة.");
    } catch (cause) {
      showFailure(cause, "تعذر تحديث اسم مستخدم العائلة.");
    } finally {
      setLoading(false);
    }
  };

  const rotateAdminCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !codeIsValid(adminCode)) {
      setError("رمز الأدمن الجديد يجب أن يتكون من 4 إلى 64 حرفاً.");
      return;
    }
    if (!window.confirm("سيؤدي تغيير رمز الأدمن إلى إنهاء جلسة الإدارة الحالية وإبطال الرمز القديم. هل تريد المتابعة؟")) return;
    beginAction();
    try {
      await accountsApi.changeAdminCode(token, adminCode);
      setAdminCode("");
      setToken(null);
      onClose();
    } catch (cause) {
      showFailure(cause, "تعذر تغيير رمز الأدمن.");
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

  const saveChildContent = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedFamily) return;
    const validation = validateChildContent(childContent);
    if (!validation.valid) {
      setError(validation.error ?? "راجع إعدادات محتوى الطفل.");
      return;
    }
    beginAction();
    try {
      const result = await accountsApi.saveAdminContent(token, selectedFamily.id, childContent);
      setChildContent(normalizeChildContent(result.content));
      setShowContentSettings(false);
      setNotice("تم حفظ محتوى الألعاب والقصص والمتجر والصناديق، وسيظهر للأطفال عند المزامنة.");
    } catch (cause) {
      showFailure(cause, "تعذر حفظ محتوى الطفل.");
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
    onClose();
  };

  if (!token) {
    return (
      <main className="admin-login-wrapper" dir="rtl">
        <section className="admin-login-box" aria-labelledby="admin-login-title" data-testid="panel-admin-login">
          <div className="admin-icon"><ShieldCheck size={39} aria-hidden="true" /></div>
          <h1 className="admin-title" id="admin-login-title">انتهت جلسة الأدمن</h1>
          <p className="admin-login-copy">ارجع إلى بوابة «إعادة ضبط» وأدخل رمز الدخول مرة أخرى.</p>
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

      </aside>

      <section className="admin-content">
        <div className="admin-content-inner">
          {error && <p className="status-message error" role="alert" data-testid="status-admin-error">{error}</p>}
          {notice && <p className="status-message success" role="status" data-testid="status-admin-notice">{notice}</p>}

          <section className="admin-section admin-security-section" aria-labelledby="admin-security-title">
            <div className="admin-section-header">
              <div><span className="admin-kicker">الحماية</span><h3 id="admin-security-title">رمز دخول الأدمن</h3></div>
              <ShieldCheck size={22} aria-hidden="true" />
            </div>
            <form className="admin-settings-block admin-security-form" onSubmit={rotateAdminCode} autoComplete="off">
              <p>غيّر رمز بوابة «إعادة ضبط» من هنا. سيُبطل الرمز القديم وجميع جلسات الأدمن فوراً.</p>
              <div className="admin-member-code-row"><input className="admin-input code-input" data-testid="input-admin-new-code" type="password" name="admin_new_code" minLength={4} maxLength={64} value={adminCode} onChange={(event) => setAdminCode(event.target.value)} placeholder="رمز جديد" autoComplete="new-password" required /><button className="admin-btn outline-dark" data-testid="button-change-admin-code" disabled={loading}><ShieldCheck size={15} /> تغيير الرمز</button></div>
            </form>
          </section>

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
                  <button className="admin-btn primary" type="button" data-testid="button-open-child-content" onClick={() => setShowContentSettings(true)}><Sparkles size={16} /> تخصيص تجربة الطفل</button>
                  <button className="admin-btn outline-dark" type="button" data-testid="button-open-family-settings" onClick={() => setShowFamilySettings(true)}><Pencil size={16} /> إدارة المملكة</button>
                </div>
              </header>

              <div className="admin-info-banner" data-testid="panel-feature-assurance">
                <Sparkles size={21} />
                <p><strong>كل طفل تضيفه يحصل تلقائياً على كامل التجربة:</strong> التحديات، المؤقت والاستراحة، النقاط والمكافآت، الخريطة، المهام المخصصة، والتحقق بواسطة ولي الأمر. الرمز الموحد للمملكة يربط الأجهزة ويفتح جميع ملفات الأسرة.</p>
              </div>

              <section className="admin-section" aria-labelledby="owner-section-title">
                <div className="admin-section-header">
                  <div><span className="admin-kicker">صلاحيات الوالدين</span><h3 id="owner-section-title">ولي الأمر</h3></div>
                  {!owner && <button className="admin-btn primary" type="button" data-testid="button-add-owner" onClick={() => openMemberForm("owner")}><Plus size={16} /> إضافة ولي الأمر</button>}
                </div>
                {owner ? <MemberCard member={owner} loading={loading} onDelete={() => void deleteMember(owner)} /> :
                  <div className="admin-owner-empty" data-testid="empty-owner"><UserRound size={35} /><div><strong>المملكة تحتاج ولي أمر</strong><p>ولي الأمر هو المسؤول عن التحديات والمكافآت والتحقق، ويستخدم الرمز الموحد للمملكة.</p></div></div>}
              </section>

              <section className="admin-section" aria-labelledby="children-section-title">
                <div className="admin-section-header">
                  <div><span className="admin-kicker">ملفات الأبطال</span><h3 id="children-section-title">الأطفال</h3></div>
                  <button className="admin-btn primary" type="button" data-testid="button-add-child" onClick={() => openMemberForm("child")}><Plus size={16} /> إضافة طفل</button>
                </div>
                {children.length === 0 ? <div className="admin-owner-empty" data-testid="empty-children"><Baby size={35} /><div><strong>لا توجد ملفات أطفال بعد</strong><p>أضف الطفل ليظهر ملفه مباشرة في شاشة الأبطال مع كامل الميزات.</p></div></div> :
                  <div className="admin-grid">{children.map((child) => <MemberCard key={child.id} member={child} loading={loading} onDelete={() => void deleteMember(child)} />)}</div>}
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
            <label className="admin-field"><span>اسم مستخدم العائلة</span><input className="admin-input" data-testid="input-new-family-username" dir="ltr" inputMode="text" pattern="[A-Za-z0-9]{3,64}" minLength={3} maxLength={64} value={newFamily.username} onChange={(event) => setNewFamily({ ...newFamily, username: event.target.value.replace(/[^A-Za-z0-9]/g, "") })} placeholder="Family2026" autoComplete="off" required /><small>أحرف إنجليزية وأرقام فقط، ويُستخدم مع رمز المملكة عند الدخول.</small></label>
            <label className="admin-field"><span>رمز المملكة</span><input className="admin-input code-input" data-testid="input-new-family-code" type="password" minLength={4} maxLength={64} value={newFamily.code} onChange={(event) => setNewFamily({ ...newFamily, code: event.target.value })} placeholder="4 أحرف أو أرقام على الأقل" autoComplete="new-password" required /><small>يستخدمه ولي الأمر لربط هواتف وأجهزة الأسرة.</small></label>
            <div className="admin-form-actions"><button className="admin-btn outline-dark" type="button" data-testid="button-cancel-create-family" onClick={() => setShowCreateFamily(false)}>إلغاء</button><button className="admin-btn primary" data-testid="button-submit-create-family" disabled={loading}><Check size={16} /> إنشاء المملكة</button></div>
          </form>
        </Modal>
      )}

      {showMemberForm && selectedFamily && (
        <Modal title={newMember.role === "owner" ? "إضافة ولي الأمر" : "إضافة ملف طفل"} onClose={() => setShowMemberForm(false)} testId="modal-create-member">
          <form onSubmit={createMember}>
            <label className="admin-field"><span>{newMember.role === "owner" ? "اسم ولي الأمر" : "اسم الطفل"}</span><input className="admin-input" data-testid="input-new-member-name" maxLength={120} value={newMember.name} onChange={(event) => setNewMember({ ...newMember, name: event.target.value })} required /></label>
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
          <form className="admin-settings-block" onSubmit={updateFamilyUsername}>
            <h4>اسم مستخدم العائلة</h4>
            <p>أحرف إنجليزية وأرقام فقط. ستحتاج الأسرة إلى الاسم الجديد مع رمزها عند الدخول التالي.</p>
            <div className="admin-member-code-row"><input className="admin-input" data-testid="input-family-username" dir="ltr" pattern="[A-Za-z0-9]{3,64}" minLength={3} maxLength={64} value={familyUsername} onChange={(event) => setFamilyUsername(event.target.value.replace(/[^A-Za-z0-9]/g, ""))} autoComplete="off" required /><button className="admin-btn outline-dark" data-testid="button-save-family-username" disabled={loading}>حفظ اسم المستخدم</button></div>
          </form>
          <form className="admin-settings-block" onSubmit={rotateFamilyCode}>
            <h4>الرمز الموحد</h4>
            <p>يستخدمه جميع أفراد الأسرة للدخول. تغييره ينقل التقدم إلى الرمز الجديد ويلغي الرمز القديم وجميع الجلسات.</p>
            <div className="admin-member-code-row"><input className="admin-input code-input" data-testid="input-family-new-code" type="password" minLength={4} maxLength={64} value={familyCode} onChange={(event) => setFamilyCode(event.target.value)} placeholder="الرمز الجديد" autoComplete="new-password" required /><button className="admin-btn outline-dark" data-testid="button-change-family-code" disabled={loading}><KeyRound size={15} /> تغيير الرمز</button></div>
          </form>
          <div className="admin-settings-block danger-zone">
            <h4>حذف المملكة نهائياً</h4>
            <p>يحذف ولي الأمر والأطفال وكل النقاط والمهام والتحديات النشطة.</p>
            <button className="admin-btn danger full-width" data-testid="button-delete-family" type="button" disabled={loading} onClick={() => void deleteFamily()}><Trash2 size={16} /> حذف المملكة وكل بياناتها</button>
          </div>
        </Modal>
      )}

      {showContentSettings && selectedFamily && (
        <Modal title={`تخصيص تجربة أطفال ${selectedFamily.name}`} onClose={() => setShowContentSettings(false)} testId="modal-child-content">
          <form className="admin-content-editor" onSubmit={saveChildContent}>
            <p className="admin-modal-copy">عدّل الألعاب والقصص والمكافآت لهذه المملكة فقط. تُحفظ التغييرات مركزياً وتصل إلى جميع أجهزة الأطفال.</p>
            <ContentEditorFields value={childContent} onChange={setChildContent} />
            <div className="admin-form-actions sticky-actions">
              <button className="admin-btn outline-dark" type="button" data-testid="button-reset-child-content" onClick={() => { if (window.confirm("هل تريد استعادة المحتوى الافتراضي في النموذج؟")) setChildContent(structuredClone(defaultChildContent)); }}>استعادة الافتراضي</button>
              <button className="admin-btn primary" data-testid="button-save-child-content" disabled={loading}><Check size={16} /> {loading ? "جارٍ الحفظ…" : "حفظ ونشر للأطفال"}</button>
            </div>
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

function ContentEditorFields({ value, onChange }: { value: ChildContentConfig; onChange: (value: ChildContentConfig) => void }) {
  const updateStory = (index: number, patch: Partial<ChildContentConfig["readingStories"][number]>) => {
    onChange({ ...value, readingStories: value.readingStories.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };
  const updateStore = (index: number, patch: Partial<ChildContentConfig["storeItems"][number]>) => {
    onChange({ ...value, storeItems: value.storeItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };
  const rewardKinds: { value: RewardKind; label: string }[] = [
    { value: "screen", label: "وقت شاشة" },
    { value: "treat", label: "مكافأة عينية" },
    { value: "money", label: "مصروف" },
    { value: "game", label: "لعبة" },
  ];

  return (
    <div className="content-editor-sections">
      <details open>
        <summary>نقاط التعلّم <span>تُمنح لكل إنجاز</span></summary>
        <div className="content-editor-card learning-point-rewards">
          <div className="admin-form-row">
            <label className="admin-field"><span>إكمال قصة القراءة</span><input className="admin-input" data-testid="input-reading-story-points" type="number" min={1} max={100} value={value.pointRewards.readingStory} onChange={(event) => onChange({ ...value, pointRewards: { ...value.pointRewards, readingStory: Number(event.target.value) } })} required /></label>
          </div>
        </div>
      </details>
      <details>
        <summary>القراءة السريعة <span>6 قصص</span></summary>
        <div className="content-editor-list">
          {value.readingStories.map((story, index) => (
            <fieldset className="content-editor-card" key={story.id}>
              <legend>القصة {index + 1}</legend>
              <label className="admin-field"><span>العنوان</span><input className="admin-input" data-testid={`input-story-title-${index}`} maxLength={120} value={story.title} onChange={(event) => updateStory(index, { title: event.target.value })} required /></label>
              <label className="admin-field"><span>النص المشكول</span><textarea className="admin-input content-story-text" maxLength={2500} rows={5} value={story.text} onChange={(event) => updateStory(index, { text: event.target.value })} required /></label>
            </fieldset>
          ))}
        </div>
      </details>

      <details>
        <summary>متجر المكافآت <span>12 مكافأة • 5–25 نقطة</span></summary>
        <div className="content-editor-list compact">
          {value.storeItems.map((item, index) => (
            <fieldset className="content-editor-card" key={item.id}>
              <legend>المكافأة {index + 1}</legend>
              <label className="admin-field"><span>الاسم</span><input className="admin-input" data-testid={`input-store-title-${index}`} maxLength={160} value={item.title} onChange={(event) => updateStore(index, { title: event.target.value })} required /></label>
              <div className="admin-form-row">
                <label className="admin-field"><span>السعر</span><input className="admin-input" type="number" min={5} max={25} value={item.cost} onChange={(event) => updateStore(index, { cost: Number(event.target.value) })} required /></label>
                <label className="admin-field"><span>النوع</span><select className="admin-input" value={item.kind} onChange={(event) => updateStore(index, { kind: event.target.value as RewardKind })}>{rewardKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
              </div>
            </fieldset>
          ))}
        </div>
      </details>

      <details>
        <summary>صناديق الحظ <span>قيم الجوائز</span></summary>
        <div className="content-editor-card box-values-editor">
          <label className="admin-field"><span>الجوائز الكبرى — 3 قيم</span><input className="admin-input" data-testid="input-major-box-rewards" value={value.majorBoxRewards.join(", ")} onChange={(event) => onChange({ ...value, majorBoxRewards: event.target.value.split(",").map(Number).filter(Number.isFinite) })} required /><small>مثال: 50, 75, 100</small></label>
          <label className="admin-field"><span>القيم المعروضة للتحفيز — قيمتان</span><input className="admin-input" data-testid="input-display-box-rewards" value={value.displayBoxRewards.join(", ")} onChange={(event) => onChange({ ...value, displayBoxRewards: event.target.value.split(",").map(Number).filter(Number.isFinite) })} required /><small>مثال: 10, 15</small></label>
        </div>
      </details>
    </div>
  );
}

function MemberCard({
  member,
  loading,
  onDelete,
}: {
  member: FamilyMember;
  loading: boolean;
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
        <button className="admin-btn danger" data-testid={`button-delete-member-${member.id}`} type="button" disabled={loading} onClick={onDelete}><Trash2 size={15} /> حذف {isOwner ? "ولي الأمر" : "ملف الطفل"}</button>
      </div>
    </article>
  );
}