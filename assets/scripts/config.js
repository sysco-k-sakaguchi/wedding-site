// ここは「内容を差し替える場所」をひとつに集めた設定ファイルです。
// 名前、日付、会場、RSVP の URL はまずこのファイルを編集してください。

export const PLACEHOLDER_URL = "FORM_URL";

export const EXPERIENCE_CONFIG = {
  coupleNames: "Masato & Haruka",
  invitationMessage: "どうぞお越しいただけましたら幸いです。",
  weddingDateIso: "2026-10-12T11:30:00+09:00",
  weddingDateDisplay: "2026年10月12日(月)",
  weddingTimeDisplay: "11:30 挙式開始",
  dateReveal: {
    year: "2026",
    day: "10.12",
    weekday: "Monday"
  },
  venue: {
    name: "京都・梨木神社",
    address: "京都府京都市上京区染殿町680",
    access: "京阪「出町柳駅」より徒歩約15分 / 市バス「府立医大病院前」より徒歩約3分",
    note: "到着後は境内のご案内に沿って受付までお進みください。"
  },
  dining: {
    name: "イタリアンダニエルズルーチェ",
    note: "挙式後、会場を移して会食を予定しております。"
  },
  chapters: {
    okinawa: {
      date: "7月○日",
      note: "旅の予定は整い次第ご案内します"
    },
    ceremony: {
      date: "10月12日",
      note: "挙式と会食についてご案内します"
    },
    friendsParty: {
      date: "11月29日",
      note: "友人の皆さまと別日にご一緒する会です"
    }
  },
  photoShareNote: "写真共有は挙式後にご案内します",
  mapEmbedUrl: "https://maps.google.com/maps?hl=ja&q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD&z=16&output=embed",
  mapExternalUrl: "https://maps.google.com/?q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD",
  rsvpUrl: PLACEHOLDER_URL,
  rsvpDeadline: "2026年8月31日(月)",
  footerCredit: {
    prefix: "Invitation design",
    name: "Keiichi Sakaguchi"
  },
  closingMessage: "皆さまにお会いできる日を、心より楽しみにしております。",
  schedule: [
    {
      time: "11:00",
      title: "受付開始",
      description: "境内控室にて受付を行います。"
    },
    {
      time: "11:30",
      title: "挙式",
      description: "スタッフがご案内いたします。"
    },
    {
      time: "12:30",
      title: "写真撮影",
      description: "集合写真とご親族撮影を予定しています。"
    },
    {
      time: "13:00",
      title: "会食開始",
      description: "会場を移して会食を行います。"
    }
  ]
};

export const EXPERIENCE_SETTINGS = {
  curtainIntroDelay: 320,
  curtainPreludeDuration: 420,
  curtainOpenDuration: 1600,
  curtainRevealDelay: 220,
  curtainScrollDelay: 340,
  scratchCompleteRatio: 0.42,
  scratchBrushSize: 20,
  scratchGestureDistance: 155,
  scratchRevealDelay: 220
};
