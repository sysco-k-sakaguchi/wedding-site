// 名前、日付、会場、URL、各言語の文言はこのファイルでまとめて変更できます。

export const PLACEHOLDER_URL = "FORM_URL";

export const EXPERIENCE_CONFIG = {
  defaultLocale: "ja",
  shared: {
    weddingDateIso: "2026-10-12T11:30:00+09:00",
    curtainDateDisplay: "2026 · 10 · 12",
    mapExternalUrl: "https://maps.google.com/?q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD",
    rsvpUrl: "https://brapla.com/bcs/guest/01KK7V9HQ9TXP1XWVWQJC10RHN/o29x?openExternalBrowser=1&t=1775548405"
  },
  locales: {
    ja: {
      metaTitle: "Masato & Haruka | Wedding Invitation",
      metaDescription: "挙式と会食をはじめ各日のご案内をまとめた Masato と Haruka のウェディング招待状です",
      coupleNames: "Masato & Haruka",
      invitationMessage: "ご多用のところ恐れ入りますがご列席賜れますと幸いです",
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
        name: "イタリアンダニエルズルーチェ",
        note: "挙式後は会場を移して会食を予定しております"
      },
      chapters: {
        okinawa: {
          date: "7月7日",
          note: "沖縄旅行について"
        },
        ceremony: {
          date: "10月12日",
          note: "挙式・会食のご案内"
        },
        friendsParty: {
          date: "11月29日",
          note: "詳細は決まり次第ご案内します"
        }
      },
      photoShareNote: "写真共有は挙式後にご案内します",
      mapEmbedUrl: "https://maps.google.com/maps?hl=ja&q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD&z=16&output=embed",
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
          time: "15:00",
          title: "会食開始",
          description: "会場を移して会食を行います"
        }
      ],
      copy: {
        heroLead: "このたび挙式と会食を執り行うこととなりました",
        summaryAria: "基本情報",
        rsvpButton: "出欠回答はこちら",
        chapterNavAria: "各編への移動",
        okinawaTitle: "沖縄編",
        ceremonyTitle: "挙式編",
        partyTitle: "友人の集い編",
        okinawaFactsAria: "沖縄編の情報",
        photoTitle: "PHOTOS",
        photoReserved: "横にスワイプしてご覧ください · タップで拡大",
        photoPlaceholderAria: "ウェディング写真ギャラリー",
        photoDotsAria: "写真の位置",
        photoAltPrefix: "ウェディング写真",
        photoDotPrefix: "写真",
        photoLightboxAria: "写真の拡大表示",
        photoCloseAria: "拡大表示を閉じる",
        ceremonyFactsAria: "挙式の基本情報",
        venueHeading: "会場について",
        mapLink: "Google Mapsで見る",
        mapAria: "挙式会場の地図",
        mapTitle: "挙式会場地図",
        scheduleHeading: "当日の流れ",
        informationHeading: "ご案内",
        rsvpDeadlinePrefix: "ご返信は",
        rsvpDeadlineSuffix: "までにお願いいたします",
        partyFactsAria: "友人の集い編の情報",
        creditAria: "サイト作成者情報",
        creditPhotoAlt: "サイト作成者 Keiichi Sakaguchi の写真",
        languageSwitchLabel: "English",
        languageSwitchAria: "招待状を英語に切り替える",
        placeholderAlert: "RSVP の URL はまだ仮設定です。設定ファイルの rsvpUrl を差し替えてください。"
      }
    },
    en: {
      metaTitle: "Masato & Haruka | Wedding Invitation",
      metaDescription: "The wedding invitation for Masato and Haruka, with details for the ceremony, celebration meal, and each gathering.",
      coupleNames: "Masato & Haruka",
      invitationMessage: "We would be delighted if you could join us on this special day.",
      weddingDateDisplay: "Monday, October 12, 2026",
      weddingTimeDisplay: "Ceremony begins at 11:30 AM",
      dateReveal: {
        year: "2026",
        day: "10.12",
        weekday: "Monday"
      },
      venue: {
        name: "Nashinoki Shrine, Kyoto",
        address: "680 Somedonocho, Kamigyo Ward, Kyoto",
        access: "About a 15-minute walk from Keihan Demachiyanagi Station / about a 3-minute walk from Furitsu Idai Byoin-mae bus stop",
        note: "On arrival, please follow the signs in the shrine grounds to the reception desk."
      },
      dining: {
        name: "Daniel's Luce",
        note: "After the ceremony, we will move to the restaurant for a celebratory meal."
      },
      chapters: {
        okinawa: {
          date: "July 7",
          note: "Our Okinawa trip"
        },
        ceremony: {
          date: "October 12",
          note: "Wedding ceremony and celebration meal"
        },
        friendsParty: {
          date: "November 29",
          note: "Further details will follow"
        }
      },
      photoShareNote: "Details about photo sharing will be provided after the ceremony.",
      mapEmbedUrl: "https://maps.google.com/maps?hl=en&q=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD&z=16&output=embed",
      rsvpDeadline: "Tuesday, June 30, 2026",
      closingMessage: "We look forward to celebrating with you.",
      schedule: [
        {
          time: "11:00",
          title: "Reception opens",
          description: "Please check in at the waiting room within the shrine grounds."
        },
        {
          time: "11:30",
          title: "Wedding ceremony",
          description: "Our staff will guide you to the ceremony."
        },
        {
          time: "12:00",
          title: "Photographs",
          description: "Group and family photographs are planned."
        },
        {
          time: "15:00",
          title: "Celebration meal",
          description: "We will move to the restaurant for the meal."
        }
      ],
      copy: {
        heroLead: "We are delighted to invite you to our wedding ceremony and celebratory meal.",
        summaryAria: "Wedding details",
        rsvpButton: "RSVP here",
        chapterNavAria: "Jump to each chapter",
        okinawaTitle: "Okinawa",
        ceremonyTitle: "Ceremony",
        partyTitle: "Gathering with Friends",
        okinawaFactsAria: "Okinawa details",
        photoTitle: "PHOTOS",
        photoReserved: "Swipe to explore · Tap to enlarge",
        photoPlaceholderAria: "Wedding photo gallery",
        photoDotsAria: "Photo positions",
        photoAltPrefix: "Wedding photo",
        photoDotPrefix: "Photo",
        photoLightboxAria: "Enlarged photo view",
        photoCloseAria: "Close enlarged photo",
        ceremonyFactsAria: "Ceremony details",
        venueHeading: "Venue",
        mapLink: "View on Google Maps",
        mapAria: "Map of the wedding venue",
        mapTitle: "Wedding venue map",
        scheduleHeading: "Order of the Day",
        informationHeading: "Information",
        rsvpDeadlinePrefix: "Please respond by",
        rsvpDeadlineSuffix: ".",
        partyFactsAria: "Friends gathering details",
        creditAria: "Website creator",
        creditPhotoAlt: "Portrait of website creator Keiichi Sakaguchi",
        languageSwitchLabel: "日本語",
        languageSwitchAria: "Switch the invitation to Japanese",
        placeholderAlert: "The RSVP URL is still a placeholder. Please update rsvpUrl in the configuration file."
      }
    }
  }
};

export const EXPERIENCE_SETTINGS = {
  curtainIntroDelay: 900,
  curtainPreludeDuration: 620,
  curtainOpenDuration: 2200,
  curtainOpenHoldDuration: 900,
  scratchCompleteRatio: 0.36,
  scratchBrushSize: 24,
  scratchGestureDistance: 130,
  scratchRevealDelay: 260
};
