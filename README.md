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
npm install github:lagoapps-dev/expo-updates-manual
```

מריץ אוטומטית `postinstall` שמוסיף `.github/workflows/manual-update.yml` לפרויקט (אם אין כבר קובץ כזה).

## הגדרה - app.json

```json
{
  "expo": {
    "plugins": [
      ["@lagoapps/expo-updates-manual", {
        "apiBaseUrl": "https://manual-updates-server.onrender.com",
        "projectId": "family-app"
      }]
    ]
  }
}
```

`projectId` הוא מזהה ייחודי לפרויקט הזה - חייב להיות זהה בכל הפרויקט (app.json + ה-Action קורא אותו משם).

**חשוב:** צריך build חדש דרך EAS Build אחרי הוספת הפלאגין (השינוי ל-`updates.checkAutomatically` נכנס לבינארי הנטיבי).

## שימוש בקוד האפליקציה

בשורש האפליקציה (למשל App.tsx), לפני שהמסכים נטענים:

```tsx
import { initManualUpdates } from '@lagoapps/expo-updates-manual';

useEffect(() => {
  initManualUpdates(); // משחזר בחירה שנשמרה מסשן קודם, ומרענן בשקט אם יש חדש יותר על אותו branch
}, []);
```

מסך הבחירה:

```tsx
import { UpdatePickerScreen } from '@lagoapps/expo-updates-manual/src/client/UpdatePickerScreen';

<UpdatePickerScreen />
```

הבחירה נשמרת ב-AsyncStorage ונטענת מחדש אוטומטית בכל הפעלה, עד שהמשתמש לוחץ "איפוס לגרסת ברירת המחדל" (`resetSelection()`) במסך.

## GitHub Action

נוצר אוטומטית ב-`.github/workflows/manual-update.yml`. רץ בכל push לבראנץ' `version/**` (או ביצירת בראנץ' כזה):
1. מריץ `eas update --branch <שם הבראנץ'>`
2. קורא את ה-`projectId` מ-`app.json`
3. שולח POST ל-`manual-updates-server` עם פרטי העדכון

צריך להגדיר ב-repo (Settings → Secrets and variables → Actions):
- `EXPO_TOKEN`
- `MANUAL_UPDATES_SERVER_URL`
- `MANUAL_UPDATES_API_KEY`

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
SDK 54+ ו-expo-updates 0.29.0+ (ה-API של override עדכונים בזמן ריצה). אם לא - `npm install` **נכשל** עם
הודעת שגיאה ברורה במקום להתקין חבילה שלא תעבוד בשקט.

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

## מה קורה אם עדכון שמופיע ברשימה לא באמת קיים/תואם

הבידוד האמיתי בין הפרויקטים שלך לא מגיע מה-`projectId` הפנימי (שהוא סתם שדה סינון בתצוגה) -
הוא מגיע מ-`updates.url` שאפוי בתוך ה-build הנטיבי (מבוסס `extra.eas.projectId` האמיתי של EAS).
כלומר גם אם ה-DB "מתבלבל" בין פרויקטים, `checkForUpdateAsync()` תמיד שואל את EAS על האפליקציה
הנכונה - רק שם ה-channel משתנה.

הזרימה בפועל ב-`selectAndApplyUpdate`:
1. שומר את ה-branch הקודם (מה-storage), למקרה שיהיה צריך לחזור אליו
2. מגדיר את ה-header override ל-branch החדש
3. `checkForUpdateAsync()` - אם ה-branch לא קיים בפרויקט הזה, או שגרסת ה-runtime לא תואמת ל-build
   הנוכחי, EAS פשוט מחזיר `isAvailable: false` (לא זורק שגיאה)
4. אם אין עדכון זמין - **זורק שגיאה, ומחזיר את ה-header override למצב הקודם** לפני שהשגיאה
   מגיעה ל-UI, כדי שלא יישאר "תקוע" מכוון ל-branch שגוי לשאר הסשן
5. שום `fetchUpdateAsync`/`reloadAsync`/`AsyncStorage.setItem` לא רץ - האפליקציה ממשיכה על
   הגרסה הנוכחית שלה בלי שינוי, והמשתמש רואה הודעת שגיאה במסך הבחירה

באותה רוח, `initManualUpdates()` (שרץ אוטומטית ב-launch על בחירה שמורה) עוטף את הבדיקה ב-try/catch
משלו: אם הבדיקה נכשלת (branch לא קיים יותר, אין רשת וכו') - רק מדפיס אזהרה וממשיך להריץ את מה
שכבר מותקן, בלי לנסות שוב עד ה-launch הבא.

## הערות

- `Updates.setUpdateRequestHeadersOverride` היא API חדשה יחסית (SDK 54 / expo-updates 0.29.0+) —
  ודא תאימות גרסה בכל פרויקט.
- שדות ה-JSON המדויקים שמחזיר `eas update --json` (למשל `group`/`id`) כדאי לוודא מול הפלט האמיתי
  אצלך בגרסת ה-eas-cli הנוכחית ולהתאים ב-`templates/github-workflow/manual-update.yml` אם צריך.
- `initManualUpdates()` מבצע קריאת רשת בכל הפעלה (כדי לבדוק אם יש חדש יותר על אותו branch) —
  אם תרצה למזער את זה, אפשר להוסיף cache/tteest זמן בין בדיקות.
