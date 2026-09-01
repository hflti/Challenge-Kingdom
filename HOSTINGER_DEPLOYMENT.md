# نشر مملكة التحديات على Hostinger

## 1. إعداد قاعدة MySQL

أنشئ قاعدة MySQL ومستخدماً لها من لوحة Hostinger. لا تحتاج إلى إنشاء الجداول يدوياً؛ ينشئ `api.php` جداول `kingdom_states` و`families` و`family_members` و`admin_credentials` تلقائياً عند أول طلب.

## 2. إعداد PHP

بعد بناء الواجهة، انسخ محتويات:

```text
artifacts/challenge-kingdom/dist/public/
```

إلى مجلد الموقع في Hostinger، وغالباً يكون `public_html`.

داخل المجلد المنشور:

1. انسخ `api-config.example.php` باسم `api-config.php`.
2. أدخل اسم قاعدة البيانات والمستخدم وكلمة المرور.
3. غيّر `app_secret` إلى قيمة عشوائية ثابتة لا تقل عن 32 حرفاً.
4. عيّن `initial_admin_code` في ملف `api-config.php` الخاص فقط إلى رمز المدير الأولي (4–64 حرفاً). لا تضعه في Git أو في ملفات البناء. عند أول تسجيل دخول، يحفظ الخادم HMAC فقط؛ وبعد ذلك يمكن للمدير تدوير الرمز من API.
5. اترك `allowed_origin` فارغاً عندما تكون الواجهة و`api.php` على النطاق نفسه.

لا ترفع `api-config.php` إلى مستودع عام ولا تشارك محتواه.

## 3. بناء الواجهة

من جذر المشروع:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/challenge-kingdom run build
```

بناء الإنتاج يتصل افتراضياً بالملف:

```text
./api.php
```

إذا كان الملف على نطاق أو مسار مختلف، ابنِ الواجهة هكذا:

```bash
PORT=5173 BASE_PATH=/ VITE_KINGDOM_API_URL=https://example.com/path/api.php pnpm --filter @workspace/challenge-kingdom run build
```

عند استخدام نطاق مختلف، ضع ذلك النطاق نفسه في `allowed_origin` داخل `api-config.php`.

## 4. متطلبات الاستضافة

- PHP 8.0 أو أحدث.
- إضافة PDO MySQL مفعّلة.
- قاعدة MySQL أو MariaDB تدعم InnoDB.
- صلاحية إنشاء الجداول لمستخدم قاعدة البيانات عند أول تشغيل.
- اجعل `api-config.php` قابلاً للقراءة من PHP فقط وغير قابل للوصول المباشر عبر الويب إن أمكن.

## 5. فحص سريع

بعد رفع الملفات، افتح الموقع وأدخل رمز عائلة جديداً. يجب أن ينشئ أول حفظ سجلاً في جدول `kingdom_states`. طلب `GET` إلى `api.php` من دون ترويسة رمز العائلة يعيد خطأ `400` بصيغة JSON، وهذا متوقع.