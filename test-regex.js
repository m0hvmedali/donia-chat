const lines = `15/03/24, 6:46 am - Mohamed Aly: ماشي يدنيت
15/03/24, 6:46 am - Mohamed Aly: ا
15/03/24, 6:46 am - Mohamed Aly: عل العموم انا حاولت اريحك وقولتلك اني مش هكلمه
15/03/24, 6:46 am - Mohamed Aly: بس مش عايزك انت تكلميه
15/03/24, 6:46 am - Mohamed Aly: انت اللي مش عايزه تريحيني
15/03/24, 6:47 am - Mohamed Aly: سلام
15/03/24, 2:35 pm - Donia Ibrahim: اها اثبت بس اي الفايده من انك كل خمس دقايق تقولي حنين وكانت بتعمل اي وم بتعمل اي`.split('\n');

const lineRegex = /^\[?(\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4})[,\s]+(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:\s*[a-zA-Z]{1,2}|\s*[صم])?)\]?\s*(?:-\s*)?([^:]+):\s(.*)$/i;

for (const originalLine of lines) {
  const cleanLine = originalLine
      .replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u202F]/g, ' ')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
      
  const match = cleanLine.match(lineRegex);
  console.log(match ? "MATCH: " + match[3] : "FAIL: " + cleanLine);
}
