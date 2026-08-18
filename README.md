# @lagoapps/expo-updates-manual

חבילה שמאפשרת למשתמש לבחור עדכון ספציפי מתוך רשימה ולהתקין אותו, במקום עדכונים אוטומטיים.
עובדת מול שרת מרכזי אחד (ראה `manual-updates-server`) המשותף לכל הפרויקטים שלך.

## איך זה מתחבר

```
[Git branch version/*]
        │  push/commit
        ▼
[GitHub Action] ──eas update──▶ [EAS servers]
        │
        └──POST /api/updates──▶ [manual-updates-server + MongoDB]
                                          ▲
                                          │  GET /api/updates?projectId=X
                                   [האפליקציה שלך]
```

## התקנה בפרויקט Expo חדש

```bash
npm install github:idolago94/expo-updates-manual
```

מריץ אוטומטית `postinstall` שמוסיף `.github/workflows/manual-update.yml` לפרויקט (אם אין כבר קובץ כזה).

## הגדרה - app.json

```json
{
  "expo": {
    "plugins": [
      ["@lagoapps/expo-updates-manual", {
        "apiBaseUrl": "https://manual-updates-server.vercel.app",
        "projectId": "family-app"
      }]
    ]
  }
}
```

`projectId` הוא מזהה ייחודי לפרויקט הזה - חייב להיות זהה בכל הפרויקט (app.json + ה-Action קורא אותו משם).

**חשוב:** צריך build חדש דרך EAS Build אחרי הוספת הפלאגין (השינוי ל-`updates.checkAutomatically` ול-
`updates.disableAntiBrickingMeasures` נכנס לבינארי הנטיבי).

⚠️ **`disableAntiBrickingMeasures: true` מוגדר אוטומטית ע"י הפלאגין** - זה נדרש כדי ש-
`Updates.setUpdateURLAndRequestHeadersOverride` (ה-API שמאפשר לטעון עדכון ספציפי לפי ID, בלי
לגעת ב-channel) יעבוד בכלל. המשמעות: מנגנוני ה-rollback הבטוחים של expo-updates כבויים ב-build
הזה. **אל תשתמש בפלאגין הזה ב-build שמופץ למשתמשי production** - רק ב-preview/internal.

## שימוש בקוד האפליקציה

בשורש האפליקציה (למשל App.tsx), לפני שהמסכים נטענים:

```tsx
import { initManualUpdates } from '@lagoapps/expo-updates-manual';

useEffect(() => {
  initManualUpdates(); // משחזר בחירה שנשמרה מסשן קודם, מוריד ומחיל אותה אם היא לא כבר רצה
}, []);
```

מסך הבחירה:

```tsx
import { UpdatePickerScreen } from '@lagoapps/expo-updates-manual/src/client/UpdatePickerScreen';

<UpdatePickerScreen />
```

הבחירה נשמרת ב-AsyncStorage. **חשוב:** `selectAndApplyUpdate`/`resetSelection` לא מרעננים את
האפליקציה מיידית - לפי התיעוד של Expo, override של `updateUrl` נכנס לתוקף רק בהפעלה מלאה הבאה
(סגירה מוחלטת ופתיחה מחדש - `Updates.reloadAsync()` לא מספיק). `UpdatePickerScreen` מציג הודעה
שמבקשת מהמשתמש לסגור ולפתוח את האפליקציה מחדש; רק ב-launch הבא, `initManualUpdates()` בפועל
מוריד ומחיל את העדכון שנבחר.

## GitHub Action

נוצר אוטומטית ב-`.github/workflows/manual-update.yml`. רץ בכל push לבראנץ' `version/**` (או ביצירת בראנץ' כזה):
1. מריץ `eas update --branch <שם הבראנץ'> --environment <EAS_UPDATE_ENVIRONMENT>`
2. קורא את ה-`projectId` מ-`app.json`
3. שולח POST ל-`manual-updates-server` עם פרטי העדכון

**חשוב על `--environment`:** בלי הדגל הזה, `eas update` לא מושך משתני סביבה מ-EAS (כמו ש-
`eas build` עושה) - הוא רק קורא קבצי `.env` מקומיים, שבד"כ לא קיימים בכלל ב-checkout של ה-CI
(gitignored). התוצאה: כל משתנה `EXPO_PUBLIC_*` נכנס לבאנדל כ-`undefined` ממש, וזה מתפוצץ רק
בזמן ריצה אחרי שמישהו בוחר את העדכון. ברירת המחדל היא `preview` - אם ה-environment הרלוונטי
ב-EAS אצלך נקרא אחרת, הגדר משתנה repo/org בשם `EAS_UPDATE_ENVIRONMENT`
(Settings → Secrets and variables → Actions → Variables).

צריך להגדיר ב-repo (Settings → Secrets and variables → Actions):
- `EXPO_TOKEN`
- `MANUAL_UPDATES_SERVER_URL`
- `MANUAL_UPDATES_API_KEY`
- `EAS_UPDATE_ENVIRONMENT` (Variable, לא Secret) - אופציונלי, ברירת מחדל `preview`

לפרסום עדכון חדש שיופיע ברשימה למשתמש:
```bash
git checkout -b version/1-3-0
git commit -am "תיאור השינוי"
git push origin version/1-3-0
```

## דרישות מוקדמות (לא מותקנות אוטומטית)

החבילה **לא** מתקינה או מקנפגת את `expo-updates` בשבילך - היא רק בונה על גביו. לפני ההתקנה, ודא שבפרויקט:
1. `expo-updates` מותקן: `npx expo install expo-updates`
2. הפרויקט מקונפג ל-EAS Update: `eas update:configure` (מוסיף `runtimeVersion`, `updates.url` ל-app.json)

## בדיקת תאימות אוטומטית בהתקנה

ה-`postinstall` בודק שהגרסאות המותקנות בפועל (`expo`, `expo-updates`) עומדות בדרישת המינימום -
SDK 52+ ו-expo-updates 0.27.0+ (`Updates.setUpdateURLAndRequestHeadersOverride`). אם לא -
`npm install` **נכשל** עם הודעת שגיאה ברורה במקום להתקין חבילה שלא תעבוד בשקט.

## `projectId` - איך נקבע היום

זו בחירה ידנית לגמרי: מחרוזת שאתה כותב בעצמך באופציית הפלאגין ב-`app.json`
(`{ "projectId": "family-app" }`). היא **לא** קשורה ל-`extra.eas.projectId` שה-EAS יוצר
אוטומטית (ה-UUID הפנימי של EAS) - זה מזהה נפרד, בלי שום ולידציה או ייצור אוטומטי כרגע.
צריך רק להיות עקבי (אותו ערך ב-app.json שממנו הן ה-Action והן הקליינט קוראים) וייחודי
מספיק בין הפרויקטים שלך כדי שהשרת יידע להפריד ביניהם. ראה גם TODO למטה.

## TODO: Setup Wizard

השלב הבא המתוכנן לחבילה הזו הוא CLI wizard (למשל `npx expo-updates-manual init`) שירוץ
פעם אחת בכל פרויקט חדש ויחליף חלק מההגדרה הידנית של היום. אמור:

- לבדוק אם `expo-updates` מותקן, ואם לא - להריץ `npx expo install expo-updates` בשבילך
- לבדוק אם `eas update:configure` כבר רץ (יש `runtimeVersion` + `updates.url` תקינים ב-app.json),
  ואם לא - להריץ אותו
- לוודא/להציע `projectId` (למשל להציע ברירת מחדל מבוססת שם החבילה, ולבדוק מול השרת שהוא לא
  כבר תפוס בפרויקט אחר) במקום שיהיה מחרוזת חופשית לגמרי
- להוסיף את בלוק ה-`plugins` ל-app.json אוטומטית (במקום העתק-הדבק ידני)
- לבדוק חיבור לשרת המרכזי (`apiBaseUrl`) ולוודא שה-secrets הנדרשים ב-GitHub מוגדרים
  (או לפחות להזכיר אילו חסרים)
- לסכם בסוף עם דוח "מה תקין / מה עדיין דורש טיפול ידני"

זה עדיין לא ממומש - הקוד הנוכחי מניח שכל השלבים האלה כבר בוצעו ידנית לפני ההתקנה.

## איך זה עובד בפועל - עדכון ספציפי, לא channel

מגרסה זו, בחירת עדכון לא עוברת יותר דרך override של `expo-channel-name` (וממילא לא תלויה
בקיום channel שתואם ל-branch שפורסם - זו הייתה בעיה ידועה: `eas update --branch` יוצר רק
branch, לא channel, אז כל בחירה נכשלה עם `HTTP response error 404: There is no channel named
<branch>`). במקום זה, `selectAndApplyUpdate` משתמש ב-
`Updates.setUpdateURLAndRequestHeadersOverride` כדי להצביע ישירות על העדכון הספציפי שנבחר, לפי
`easUpdateGroupId` שלו:

```
https://u.expo.dev/<EAS project ID>/group/<easUpdateGroupId>
```

זה API "כבד" יותר מה-header-override הישן: הוא דורש `updates.disableAntiBrickingMeasures: true`
(ראה סעיף ההגדרה למעלה), ולכן מיועד ל-preview builds בלבד. חשוב גם: ה-override הזה נכנס לתוקף
רק בהפעלה מלאה הבאה של האפליקציה - `selectAndApplyUpdate`/`resetSelection` רק מגדירים אותו
ושומרים את הבחירה ב-storage; הם **לא** מורידים או מחילים כלום בעצמם. `initManualUpdates()`,
שרץ ב-launch הבא, הוא זה שבפועל מריץ `checkForUpdateAsync` → `fetchUpdateAsync` →
`reloadAsync` (רענון פנימי של ה-JS bundle בתוך אותו launch, אחרי שהעדכון כבר ירד).

אם העדכון שנבחר כבר לא קיים (נמחק, אי-התאמת runtime, אין רשת) - `initManualUpdates()` תופס
את זה ב-try/catch, מדפיס אזהרה, **מנקה את הבחירה השמורה ומאפס את ה-override** (במקום להישאר
תקוע מנסה שוב כל launch), וממשיך להריץ את מה שכבר מותקן. השגיאה לא מגיעה למסך הבחירה באותו
רגע - היא תופיע רק כ-warning בקונסול בהפעלה הבאה.

## הערות

- `Updates.setUpdateURLAndRequestHeadersOverride` היא API יחסית חדש (SDK 52+ / expo-updates
  0.27.0+) - ודא תאימות גרסה בכל פרויקט.
- ⚠️ דורש `updates.disableAntiBrickingMeasures: true`, שמכבה את מנגנוני ה-rollback הבטוחים של
  expo-updates. **preview/internal בלבד - אף פעם לא ב-build שמופץ ל-production.**
- שדות ה-JSON המדויקים שמחזיר `eas update --json` (למשל `group`/`id`) כדאי לוודא מול הפלט האמיתי
  אצלך בגרסת ה-eas-cli הנוכחית ולהתאים ב-`templates/github-workflow/manual-update.yml` אם צריך -
  `easUpdateGroupId` (השדה ש-`selectAndApplyUpdate` בפועל צריך) ממופה משם.
- אחרי בחירה/איפוס אין רענון אוטומטי מיידי - ה-UI צריך להנחות את המשתמש לסגור ולפתוח מחדש את
  האפליקציה.
