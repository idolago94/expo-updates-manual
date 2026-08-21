# @lagoapps/expo-updates-manual

חבילה שמאפשרת למשתמש לבחור עדכון ספציפי מתוך רשימה ולהתקין אותו, במקום עדכונים אוטומטיים.
עובדת מול שרת מרכזי אחד (ראה `manual-updates-server`) המשותף לכל הפרויקטים שלך.

## איך זה מתחבר

```
[Git tag update/<channel>/<label>]
        │  git push origin <tag>
        ▼
[GitHub Action] ──eas update --branch <channel> --environment <channel>──▶ [EAS servers]
        │
        └──POST /api/updates (projectId, environment, label, ...)──▶ [manual-updates-server + MongoDB]
                                          ▲
                                          │  GET /api/updates?projectId=X&environment=<Updates.channel>
                                   [האפליקציה שלך]
```

ה-`channel` בתג הוא גם ה-branch שה-update מתפרסם אליו ב-EAS, גם ה-environment שממנו
`eas update` שואב את משתני ה-`EXPO_PUBLIC_*`, וגם המסנן שלפיו האפליקציה מבקשת מה-server את
הרשימה. זה בכוונה: **build של production תמיד יראה, ויוכל לבחור, רק עדכונים שפורסמו תחת
environment `production`** - אין תרחיש שבו production "מקבל בטעות" משתני סביבה או קונפיג של
preview.

**חשוב לגבי המסנן בפועל:** `Updates.channel` משקף את ה-update שרץ *כרגע*, לא את ה-build. ברגע
שעדכון שנבחר ידנית רץ (נטען ישירות לפי `easUpdateGroupId`, בלי resolution דרך channel), אין לו
channel בכלל וה-`Updates.channel` חוזר ריק. לכן `listAvailableUpdates()` לא קורא ל-`Updates.channel`
ישירות - הוא שומר ב-storage את הערך האמיתי הראשון שראה (לפני שנבחר עדכון ידני אי-פעם, או מיד
אחרי `resetSelection()`) ומשתמש בו כ-fallback כל פעם שה-`Updates.channel` החי ריק. ראה
`getHomeEnvironment()` ב-`src/client/index.ts`.

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

<UpdatePickerScreen
  theme={{ backgroundColor: '#111', textColor: '#fff', accentColor: '#4da3ff' }}
  texts={{ resetLabel: 'Switch back to default', confirmButtonLabel: 'Restart now' }}
/>
```

`theme` הוא אופציונלי - כל שדה שלא מועבר נופל לברירת מחדל בהירה. ראה `UpdatePickerTheme` ב-
`src/client/UpdatePickerScreen.tsx` לרשימת השדות הנתמכים (רקע, טקסט, טקסט משני, גבולות, צבע
הדגשה, שגיאה, כפתור איפוס, ורקע/שכבת-על של המודל).

כל הטקסטים שהמסך מציג (אנגלית כברירת מחדל) ניתנים לדריסה דרך `texts` - ראה `UpdatePickerTexts`
לרשימת המפתחות הנתמכים (מצב ריק, כפתור איפוס, כותרת/גוף מודל ה-restart, כפתור אישור). שימושי
לתרגום או להתאמת הניסוח לטון של האפליקציה.

אם רשימת העדכונים ריקה, `UpdatePickerScreen` מציג מצב ריק ("No updates available" כברירת מחדל,
ניתן לדריסה דרך `texts.emptyState`) במקום רשימה ריקה.

הבחירה נשמרת ב-AsyncStorage. **חשוב:** `selectAndApplyUpdate`/`resetSelection` לא מרעננים את
האפליקציה מיידית - לפי התיעוד של Expo, override של `updateUrl` נכנס לתוקף רק בהפעלה מלאה הבאה
(סגירה מוחלטת ופתיחה מחדש - `Updates.reloadAsync()` לא מספיק בשביל זה). לכן `UpdatePickerScreen`
מציג מודל שמודיע שהאפליקציה תופעל מחדש; לחיצה על "אישור" קוראת ל-`restartApp()` (עטיפה סביב
`Updates.reloadAsync()`) - זו פעולת ה-"restart" הזמינה מ-JS ב-Expo, אבל היא לא מבטיחה שה-override
עצמו ייקלט (זה עדיין דורש סגירה מוחלטת ופתיחה מחדש בפועל). ב-launch הבא, `initManualUpdates()`
בפועל מוריד ומחיל את העדכון שנבחר.

## עדכון ברירת מחדל (default update)

בשרת אפשר לסמן עדכון אחד כברירת מחדל לכל `projectId`+`environment` (דרך מסך הניהול, `GET /admin`
על השרת). כשמשתמש **לא** בחר עדכון ידנית ב-`UpdatePickerScreen`, `initManualUpdates()` יבדוק בכל
launch מה העדכון המסומן כברירת מחדל, ואם הוא שונה ממה שרץ כרגע - יוריד ויחיל אותו **ברקע, אוטומטית**
(אותו מנגנון `setUpdateURLAndRequestHeadersOverride` → `checkForUpdateAsync` → `fetchUpdateAsync` →
`reloadAsync`, בלי צורך בשום פעולה של המשתמש). בחירה ידנית של המשתמש תמיד גוברת על ברירת המחדל.

כדי לדעת בקוד שלך מה קורה ברקע (למשל להציג מסך טעינה בזמן שמעדכן), יש hook:

```tsx
import { useManualUpdateState } from '@lagoapps/expo-updates-manual/src/client/useManualUpdateState';

function App() {
  const { phase, update, error } = useManualUpdateState();

  if (phase === 'downloading' || phase === 'restarting') {
    return <UpdatingOverlay label={update?.label} />;
  }
  if (phase === 'error') {
    console.warn('Update check failed:', error);
  }

  return <MainApp />;
}
```

`phase` הוא אחד מ-`'idle' | 'checking' | 'downloading' | 'restarting' | 'up-to-date' | 'no-update' | 'error'`
- ראה תיעוד `ManualUpdateState` ב-`src/client/index.ts` לפירוט כל ערך.

## GitHub Action

נוצר אוטומטית ב-`.github/workflows/manual-update.yml`. רץ על כל push של תג בצורה
`update/<channel>/<label>` (למשל `update/preview/1-3-0` או `update/production/2-0-0`):
1. מפרק את התג ל-`channel` (=`environment`) ו-`label`
2. מריץ `eas update --branch <channel> --environment <channel>` - ה-channel קובע גם
   לאיזה EAS branch מתפרסם וגם מאיזה EAS environment נשאבים משתני `EXPO_PUBLIC_*`
3. קורא את ה-`projectId` מ-`app.json`
4. שולח POST ל-`manual-updates-server` עם `projectId`, `environment`, `label` ופרטי העדכון

**חשוב על `--environment`:** בלי הדגל הזה, `eas update` לא מושך משתני סביבה מ-EAS (כמו ש-
`eas build` עושה) - הוא רק קורא קבצי `.env` מקומיים, שבד"כ לא קיימים בכלל ב-checkout של ה-CI
(gitignored). התוצאה: כל משתנה `EXPO_PUBLIC_*` נכנס לבאנדל כ-`undefined` ממש, וזה מתפוצץ רק
בזמן ריצה אחרי שמישהו בוחר את העדכון.

צריך להגדיר ב-repo (Settings → Secrets and variables → Actions):
- `EXPO_TOKEN`
- `MANUAL_UPDATES_SERVER_URL`
- `MANUAL_UPDATES_API_KEY`

וודא שקיים ב-EAS environment בשם תואם לכל `channel` שבו אתה משתמש בתגיות (למשל `preview`,
`production`) עם משתני `EXPO_PUBLIC_*` הרלוונטיים - `eas env:list --environment preview`.

לפרסום עדכון חדש שיופיע ברשימה למשתמש:
```bash
git tag update/preview/1-3-0
git push origin update/preview/1-3-0
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

חשוב: `checkForUpdateAsync().isAvailable === false` **לא** נחשב שגיאה - כתובת `group/<id>` היא
manifest קבוע, אז ברגע שהעדכון שנבחר כבר רץ זה בדיוק המצב הצפוי (אין שום דבר "חדש יותר" באותה
כתובת, לעולם). זה קרה בפועל: גרסה מוקדמת של הקוד טעתה בדיוק כאן וזרקה שגיאה על `!isAvailable`,
מה שגרם לבחירה להתאפס אוטומטית בכל launch שני (`initManualUpdates()` ראה "אין עדכון זמין" וחשב
שזו כשל, ניקה את ה-selection וחזר לברירת המחדל). `initManualUpdates()` היום פשוט לא עושה כלום
כש-`isAvailable` הוא `false` - זה "אני כבר על הגרסה הנכונה", לא כשל.

אם העדכון שנבחר באמת כבר לא קיים (נמחק, אי-התאמת runtime, אין רשת) - זה מתבטא כ-**exception**
שנזרק מתוך `checkForUpdateAsync`/`fetchUpdateAsync` עצמם (לא כ-`isAvailable: false`).
`initManualUpdates()` תופס את זה ב-try/catch, מדפיס אזהרה, **מנקה את הבחירה השמורה ומאפס את
ה-override** (במקום להישאר תקוע מנסה שוב כל launch), וממשיך להריץ את מה שכבר מותקן. השגיאה לא
מגיעה למסך הבחירה באותו רגע - היא תופיע רק כ-warning בקונסול בהפעלה הבאה.

## הערות

- `Updates.setUpdateURLAndRequestHeadersOverride` היא API יחסית חדש (SDK 52+ / expo-updates
  0.27.0+) - ודא תאימות גרסה בכל פרויקט.
- ⚠️ דורש `updates.disableAntiBrickingMeasures: true`, שמכבה את מנגנוני ה-rollback הבטוחים של
  expo-updates. **preview/internal בלבד - אף פעם לא ב-build שמופץ ל-production.**
- שדות ה-JSON המדויקים שמחזיר `eas update --json` (למשל `group`/`id`) כדאי לוודא מול הפלט האמיתי
  אצלך בגרסת ה-eas-cli הנוכחית ולהתאים ב-`templates/github-workflow/manual-update.yml` אם צריך -
  `easUpdateGroupId` (השדה ש-`selectAndApplyUpdate` בפועל צריך) ממופה משם.
- אחרי בחירה/איפוס אין רענון אוטומטי מיידי - `UpdatePickerScreen` מציג מודל שמבקש אישור ואז קורא
  ל-`restartApp()`, אבל זו רק פעולת "restart" ברמת ה-JS; קליטת ה-override עדיין תלויה בסגירה
  מוחלטת ופתיחה מחדש בפועל של האפליקציה (אין API ציבורי חוצה-פלטפורמות ל-restart תהליך אמיתי
  מ-JS ב-Expo/React Native).
