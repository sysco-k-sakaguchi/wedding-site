// ここは「内容を差し替える場所」をひとつに集めた設定ファイルです。
// 名前、日付、会場、RSVP の URL はまずこのファイルを編集してください。

export const PLACEHOLDER_URL = "FORM_URL";

export const EXPERIENCE_CONFIG = {
  coupleNames: "Masato & Haruka",
  invitationMessage: "ご多用のところ恐れ入りますがご列席賜れますと幸いです",
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
    note: "到着後は境内のご案内に沿って受付までお進みください"
  },
  dining: {
    name: "都ホテル 京都八条",
    hall: "陽明殿（ようめいでん）",
    note: "陽明殿（ようめいでん）",
    venuePageUrl: "https://www.miyakohotels.ne.jp/kyoto-hachijo/banquet/youmeiden/",
    mapEmbedUrl: "https://maps.google.com/maps?hl=ja&q=%E9%83%BD%E3%83%9B%E3%83%86%E3%83%AB%20%E4%BA%AC%E9%83%BD%E5%85%AB%E6%9D%A1%20%E9%99%BD%E6%98%8E%E6%AE%BF&z=16&output=embed",
    mapExternalUrl: "https://maps.app.goo.gl/bGf6cdNNWKWx3iPX8?g_st=il"
  },
  chapters: {
    okinawa: {
      date: "7月7日",
      note: "沖縄旅行について"
    },
    ceremony: {
      date: "10月12日",
      note: "挙式・披露宴のご案内"
    },
    friendsParty: {
      date: "11月29日",
      note: "詳細は決まり次第ご案内します"
    }
  },
  photoShareNote: "写真共有は挙式後にご案内します",
  mapEmbedUrl: "https://maps.google.com/maps?hl=ja&q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD&z=16&output=embed",
  mapExternalUrl: "https://maps.google.com/?q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD",
  rsvpUrl: "https://brapla.com/bcs/guest/01KK7V9HQ9TXP1XWVWQJC10RHN/o29x?openExternalBrowser=1&t=1775548405",
  rsvpDeadline: "2026年6月30日(火)",
  closingMessage: "皆さまにお会いできる日を心より楽しみにしております",
  schedule: [
    {
      time: "11:00",
      title: "受付開始",
      description: "境内控室にて受付を承ります"
    },
    {
      time: "11:30",
      title: "挙式",
      description: "スタッフがご案内いたします"
    },
    {
      time: "12:00",
      title: "写真撮影",
      description: "集合写真とご親族でのお写真を予定しています"
    },
    {
      time: "14:00",
      title: "会食受付",
      description: "都ホテル 京都八条にて受付を承ります"
    },
    {
      time: "14:30",
      title: "乾杯",
      description: "陽明殿にて会食を行います"
    },
    {
      time: "17:00",
      title: "おひらき",
      description: "本日は誠にありがとうございました"
    }
  ]
};

export const EXPERIENCE_SETTINGS = {
  curtainIntroDelay: 1750,
  curtainPreludeDuration: 760,
  curtainOpenDuration: 2780,
  curtainRevealDelay: 520,
  scratchCompleteRatio: 0.42,
  scratchBrushSize: 20,
  scratchGestureDistance: 155,
  scratchRevealDelay: 220
};
