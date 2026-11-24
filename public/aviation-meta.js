// Offline ICAO Annex 10 24-bit hex nationality decoder & major airline ICAO->IATA/Korean lookup.
// Shared by both Node.js backend (src/) and browser frontend (public/).

const ICAO24_RANGES = [
  [0x004000, 0x0043FF, 'ZW', '짐바브웨', 'Zimbabwe', '🇿🇼'],
  [0x006000, 0x006FFF, 'MZ', '모잠비크', 'Mozambique', '🇲🇿'],
  [0x008000, 0x00FFFF, 'ZA', '남아프리카공화국', 'South Africa', '🇿🇦'],
  [0x010000, 0x017FFF, 'EG', '이집트', 'Egypt', '🇪🇬'],
  [0x018000, 0x01FFFF, 'LY', '리비아', 'Libya', '🇱🇾'],
  [0x020000, 0x027FFF, 'MA', '모로코', 'Morocco', '🇲🇦'],
  [0x028000, 0x02FFFF, 'TN', '튀니지', 'Tunisia', '🇹🇳'],
  [0x040000, 0x040FFF, 'ET', '에티오피아', 'Ethiopia', '🇪🇹'],
  [0x04C000, 0x04CFFF, 'KE', '케냐', 'Kenya', '🇰🇪'],
  [0x064000, 0x064FFF, 'NG', '나이지리아', 'Nigeria', '🇳🇬'],
  [0x06A000, 0x06A3FF, 'QA', '카타르', 'Qatar', '🇶🇦'],
  [0x0A0000, 0x0A7FFF, 'DZ', '알제리', 'Algeria', '🇩🇿'],
  [0x0AC000, 0x0ACFFF, 'CO', '콜롬비아', 'Colombia', '🇨🇴'],
  [0x0C0000, 0x0C0FFF, 'PA', '파나마', 'Panama', '🇵🇦'],
  [0x0D0000, 0x0D7FFF, 'MX', '멕시코', 'Mexico', '🇲🇽'],
  [0x0D8000, 0x0DFFFF, 'VE', '베네수엘라', 'Venezuela', '🇻🇪'],
  [0x100000, 0x1FFFFF, 'RU', '러시아', 'Russia', '🇷🇺'],
  [0x300000, 0x33FFFF, 'IT', '이탈리아', 'Italy', '🇮🇹'],
  [0x340000, 0x37FFFF, 'ES', '스페인', 'Spain', '🇪🇸'],
  [0x380000, 0x3BFFFF, 'FR', '프랑스', 'France', '🇫🇷'],
  [0x3C0000, 0x3FFFFF, 'DE', '독일', 'Germany', '🇩🇪'],
  [0x400000, 0x43FFFF, 'GB', '영국', 'United Kingdom', '🇬🇧'],
  [0x440000, 0x447FFF, 'AT', '오스트리아', 'Austria', '🇦🇹'],
  [0x448000, 0x44FFFF, 'BE', '벨기에', 'Belgium', '🇧🇪'],
  [0x450000, 0x457FFF, 'BG', '불가리아', 'Bulgaria', '🇧🇬'],
  [0x458000, 0x45FFFF, 'DK', '덴마크', 'Denmark', '🇩🇰'],
  [0x460000, 0x467FFF, 'FI', '핀란드', 'Finland', '🇫🇮'],
  [0x468000, 0x46FFFF, 'GR', '그리스', 'Greece', '🇬🇷'],
  [0x470000, 0x477FFF, 'HU', '헝가리', 'Hungary', '🇭🇺'],
  [0x478000, 0x47FFFF, 'NO', '노르웨이', 'Norway', '🇳🇴'],
  [0x480000, 0x487FFF, 'NL', '네덜란드', 'Netherlands', '🇳🇱'],
  [0x488000, 0x48FFFF, 'PL', '폴란드', 'Poland', '🇵🇱'],
  [0x490000, 0x497FFF, 'PT', '포르투갈', 'Portugal', '🇵🇹'],
  [0x498000, 0x49FFFF, 'CZ', '체코', 'Czechia', '🇨🇿'],
  [0x4A0000, 0x4A7FFF, 'RO', '루마니아', 'Romania', '🇷🇴'],
  [0x4A8000, 0x4AFFFF, 'SE', '스웨덴', 'Sweden', '🇸🇪'],
  [0x4B0000, 0x4B7FFF, 'CH', '스위스', 'Switzerland', '🇨🇭'],
  [0x4B8000, 0x4BFFFF, 'TR', '튀르키예', 'Turkey', '🇹🇷'],
  [0x4C0000, 0x4C7FFF, 'RS', '세르비아', 'Serbia', '🇷🇸'],
  [0x4C8000, 0x4C83FF, 'CY', '키프로스', 'Cyprus', '🇨🇾'],
  [0x4CA000, 0x4CAFFF, 'IE', '아일랜드', 'Ireland', '🇮🇪'],
  [0x4CC000, 0x4CCFFF, 'IS', '아이슬란드', 'Iceland', '🇮🇸'],
  [0x4D0000, 0x4D03FF, 'LU', '룩셈부르크', 'Luxembourg', '🇱🇺'],
  [0x4D2000, 0x4D2FFF, 'MT', '몰타', 'Malta', '🇲🇹'],
  [0x501C00, 0x501FFF, 'HR', '크로아티아', 'Croatia', '🇭🇷'],
  [0x502C00, 0x502FFF, 'LV', '라트비아', 'Latvia', '🇱🇻'],
  [0x503C00, 0x503FFF, 'LT', '리투아니아', 'Lithuania', '🇱🇹'],
  [0x505C00, 0x505FFF, 'SK', '슬로바키아', 'Slovakia', '🇸🇰'],
  [0x506C00, 0x506FFF, 'SI', '슬로베니아', 'Slovenia', '🇸🇮'],
  [0x508000, 0x50FFFF, 'UA', '우크라이나', 'Ukraine', '🇺🇦'],
  [0x511000, 0x5113FF, 'EE', '에스토니아', 'Estonia', '🇪🇪'],
  [0x600000, 0x6003FF, 'AM', '아르메니아', 'Armenia', '🇦🇲'],
  [0x600800, 0x600BFF, 'AZ', '아제르바이잔', 'Azerbaijan', '🇦🇿'],
  [0x601000, 0x6013FF, 'GE', '조지아', 'Georgia', '🇬🇪'],
  [0x683000, 0x6833FF, 'KZ', '카자흐스탄', 'Kazakhstan', '🇰🇿'],
  [0x684000, 0x6843FF, 'UZ', '우즈베키스탄', 'Uzbekistan', '🇺🇿'],
  [0x700000, 0x700FFF, 'AF', '아프가니스탄', 'Afghanistan', '🇦🇫'],
  [0x702000, 0x702FFF, 'BD', '방글라데시', 'Bangladesh', '🇧🇩'],
  [0x704000, 0x704FFF, 'MM', '미얀마', 'Myanmar', '🇲🇲'],
  [0x706000, 0x706FFF, 'KW', '쿠웨이트', 'Kuwait', '🇰🇼'],
  [0x708000, 0x708FFF, 'LA', '라오스', 'Laos', '🇱🇦'],
  [0x70A000, 0x70AFFF, 'NP', '네팔', 'Nepal', '🇳🇵'],
  [0x70C000, 0x70C3FF, 'OM', '오만', 'Oman', '🇴🇲'],
  [0x70E000, 0x70EFFF, 'KH', '캄보디아', 'Cambodia', '🇰🇭'],
  [0x710000, 0x717FFF, 'SA', '사우디아라비아', 'Saudi Arabia', '🇸🇦'],
  [0x718000, 0x71FFFF, 'KR', '대한민국', 'South Korea', '🇰🇷'],
  [0x720000, 0x727FFF, 'KP', '북한', 'North Korea', '🇰🇵'],
  [0x728000, 0x72FFFF, 'IQ', '이라크', 'Iraq', '🇮🇶'],
  [0x730000, 0x737FFF, 'IR', '이란', 'Iran', '🇮🇷'],
  [0x738000, 0x73FFFF, 'IL', '이스라엘', 'Israel', '🇮🇱'],
  [0x740000, 0x747FFF, 'JO', '요르단', 'Jordan', '🇯🇴'],
  [0x748000, 0x74FFFF, 'LB', '레바논', 'Lebanon', '🇱🇧'],
  [0x750000, 0x757FFF, 'MY', '말레이시아', 'Malaysia', '🇲🇾'],
  [0x758000, 0x75FFFF, 'PH', '필리핀', 'Philippines', '🇵🇭'],
  [0x760000, 0x767FFF, 'PK', '파키스탄', 'Pakistan', '🇵🇰'],
  [0x768000, 0x76FFFF, 'SG', '싱가포르', 'Singapore', '🇸🇬'],
  [0x770000, 0x777FFF, 'LK', '스리랑카', 'Sri Lanka', '🇱🇰'],
  [0x780000, 0x7BFFFF, 'CN', '중국', 'China', '🇨🇳'],
  [0x7C0000, 0x7FFFFF, 'AU', '호주', 'Australia', '🇦🇺'],
  [0x800000, 0x83FFFF, 'IN', '인도', 'India', '🇮🇳'],
  [0x840000, 0x87FFFF, 'JP', '일본', 'Japan', '🇯🇵'],
  [0x880000, 0x887FFF, 'TH', '태국', 'Thailand', '🇹🇭'],
  [0x888000, 0x88FFFF, 'VN', '베트남', 'Vietnam', '🇻🇳'],
  [0x890000, 0x890FFF, 'YE', '예멘', 'Yemen', '🇾🇪'],
  [0x894000, 0x894FFF, 'BH', '바레인', 'Bahrain', '🇧🇭'],
  [0x895000, 0x8953FF, 'BN', '브루나이', 'Brunei', '🇧🇳'],
  [0x896000, 0x896FFF, 'AE', '아랍에미리트', 'United Arab Emirates', '🇦🇪'],
  [0x899000, 0x8993FF, 'TW', '대만', 'Taiwan', '🇹🇼'],
  [0x8A0000, 0x8A7FFF, 'ID', '인도네시아', 'Indonesia', '🇮🇩'],
  [0xA00000, 0xAFFFFF, 'US', '미국', 'United States', '🇺🇸'],
  [0xC00000, 0xC3FFFF, 'CA', '캐나다', 'Canada', '🇨🇦'],
  [0xC80000, 0xC87FFF, 'NZ', '뉴질랜드', 'New Zealand', '🇳🇿'],
  [0xC88000, 0xC88FFF, 'FJ', '피지', 'Fiji', '🇫🇯'],
  [0xE00000, 0xE3FFFF, 'AR', '아르헨티나', 'Argentina', '🇦🇷'],
  [0xE40000, 0xE7FFFF, 'BR', '브라질', 'Brazil', '🇧🇷'],
  [0xE80000, 0xE80FFF, 'CL', '칠레', 'Chile', '🇨🇱'],
  [0xE84000, 0xE84FFF, 'EC', '에콰도르', 'Ecuador', '🇪🇨'],
  [0xE8C000, 0xE8CFFF, 'PE', '페루', 'Peru', '🇵🇪']
];

const COUNTRY_NAME_MAP = new Map([
  ['republic of korea', { iso: 'KR', nameKo: '대한민국', flag: '🇰🇷' }],
  ['south korea', { iso: 'KR', nameKo: '대한민국', flag: '🇰🇷' }],
  ['korea, republic of', { iso: 'KR', nameKo: '대한민국', flag: '🇰🇷' }],
  ['japan', { iso: 'JP', nameKo: '일본', flag: '🇯🇵' }],
  ['china', { iso: 'CN', nameKo: '중국', flag: '🇨🇳' }],
  ['hong kong', { iso: 'HK', nameKo: '홍콩', flag: '🇭🇰' }],
  ['taiwan', { iso: 'TW', nameKo: '대만', flag: '🇹🇼' }],
  ['united states', { iso: 'US', nameKo: '미국', flag: '🇺🇸' }],
  ['united states of america', { iso: 'US', nameKo: '미국', flag: '🇺🇸' }],
  ['canada', { iso: 'CA', nameKo: '캐나다', flag: '🇨🇦' }],
  ['united kingdom', { iso: 'GB', nameKo: '영국', flag: '🇬🇧' }],
  ['germany', { iso: 'DE', nameKo: '독일', flag: '🇩🇪' }],
  ['france', { iso: 'FR', nameKo: '프랑스', flag: '🇫🇷' }],
  ['italy', { iso: 'IT', nameKo: '이탈리아', flag: '🇮🇹' }],
  ['spain', { iso: 'ES', nameKo: '스페인', flag: '🇪🇸' }],
  ['netherlands', { iso: 'NL', nameKo: '네덜란드', flag: '🇳🇱' }],
  ['kingdom of the netherlands', { iso: 'NL', nameKo: '네덜란드', flag: '🇳🇱' }],
  ['switzerland', { iso: 'CH', nameKo: '스위스', flag: '🇨🇭' }],
  ['turkey', { iso: 'TR', nameKo: '튀르키예', flag: '🇹🇷' }],
  ['türkiye', { iso: 'TR', nameKo: '튀르키예', flag: '🇹🇷' }],
  ['ireland', { iso: 'IE', nameKo: '아일랜드', flag: '🇮🇪' }],
  ['austria', { iso: 'AT', nameKo: '오스트리아', flag: '🇦🇹' }],
  ['belgium', { iso: 'BE', nameKo: '벨기에', flag: '🇧🇪' }],
  ['poland', { iso: 'PL', nameKo: '폴란드', flag: '🇵🇱' }],
  ['sweden', { iso: 'SE', nameKo: '스웨덴', flag: '🇸🇪' }],
  ['norway', { iso: 'NO', nameKo: '노르웨이', flag: '🇳🇴' }],
  ['finland', { iso: 'FI', nameKo: '핀란드', flag: '🇫🇮' }],
  ['denmark', { iso: 'DK', nameKo: '덴마크', flag: '🇩🇰' }],
  ['portugal', { iso: 'PT', nameKo: '포르투갈', flag: '🇵🇹' }],
  ['greece', { iso: 'GR', nameKo: '그리스', flag: '🇬🇷' }],
  ['australia', { iso: 'AU', nameKo: '호주', flag: '🇦🇺' }],
  ['new zealand', { iso: 'NZ', nameKo: '뉴질랜드', flag: '🇳🇿' }],
  ['singapore', { iso: 'SG', nameKo: '싱가포르', flag: '🇸🇬' }],
  ['thailand', { iso: 'TH', nameKo: '태국', flag: '🇹🇭' }],
  ['vietnam', { iso: 'VN', nameKo: '베트남', flag: '🇻🇳' }],
  ['viet nam', { iso: 'VN', nameKo: '베트남', flag: '🇻🇳' }],
  ['malaysia', { iso: 'MY', nameKo: '말레이시아', flag: '🇲🇾' }],
  ['indonesia', { iso: 'ID', nameKo: '인도네시아', flag: '🇮🇩' }],
  ['philippines', { iso: 'PH', nameKo: '필리핀', flag: '🇵🇭' }],
  ['india', { iso: 'IN', nameKo: '인도', flag: '🇮🇳' }],
  ['united arab emirates', { iso: 'AE', nameKo: '아랍에미리트', flag: '🇦🇪' }],
  ['qatar', { iso: 'QA', nameKo: '카타르', flag: '🇶🇦' }],
  ['saudi arabia', { iso: 'SA', nameKo: '사우디아라비아', flag: '🇸🇦' }],
  ['israel', { iso: 'IL', nameKo: '이스라엘', flag: '🇮🇱' }],
  ['brazil', { iso: 'BR', nameKo: '브라질', flag: '🇧🇷' }],
  ['mexico', { iso: 'MX', nameKo: '멕시코', flag: '🇲🇽' }],
  ['argentina', { iso: 'AR', nameKo: '아르헨티나', flag: '🇦🇷' }],
  ['chile', { iso: 'CL', nameKo: '칠레', flag: '🇨🇱' }],
  ['colombia', { iso: 'CO', nameKo: '콜롬비아', flag: '🇨🇴' }],
  ['russia', { iso: 'RU', nameKo: '러시아', flag: '🇷🇺' }],
  ['russian federation', { iso: 'RU', nameKo: '러시아', flag: '🇷🇺' }],
  ['south africa', { iso: 'ZA', nameKo: '남아프리카공화국', flag: '🇿🇦' }],
  ['ethiopia', { iso: 'ET', nameKo: '에티오피아', flag: '🇪🇹' }],
  ['egypt', { iso: 'EG', nameKo: '이집트', flag: '🇪🇬' }],
  ['morocco', { iso: 'MA', nameKo: '모로코', flag: '🇲🇦' }],
  ['malta', { iso: 'MT', nameKo: '몰타', flag: '🇲🇹' }],
  ['iceland', { iso: 'IS', nameKo: '아이슬란드', flag: '🇮🇸' }],
  ['luxembourg', { iso: 'LU', nameKo: '룩셈부르크', flag: '🇱🇺' }],
  ['kazakhstan', { iso: 'KZ', nameKo: '카자흐스탄', flag: '🇰🇿' }],
  ['uzbekistan', { iso: 'UZ', nameKo: '우즈베키스탄', flag: '🇺🇿' }],
  ['mongolia', { iso: 'MN', nameKo: '몽골', flag: '🇲🇳' }]
]);

const AIRLINES_ICAO = {
  // Korea
  KAL: { iata: 'KE', ko: '대한항공', en: 'Korean Air', country: '대한민국', flag: '🇰🇷' },
  AAR: { iata: 'OZ', ko: '아시아나항공', en: 'Asiana Airlines', country: '대한민국', flag: '🇰🇷' },
  JNA: { iata: 'LJ', ko: '진에어', en: 'Jin Air', country: '대한민국', flag: '🇰🇷' },
  JJA: { iata: '7C', ko: '제주항공', en: 'Jeju Air', country: '대한민국', flag: '🇰🇷' },
  TWB: { iata: 'TW', ko: '티웨이항공', en: "T'way Air", country: '대한민국', flag: '🇰🇷' },
  ABL: { iata: 'BX', ko: '에어부산', en: 'Air Busan', country: '대한민국', flag: '🇰🇷' },
  ASV: { iata: 'RS', ko: '에어서울', en: 'Air Seoul', country: '대한민국', flag: '🇰🇷' },
  ESR: { iata: 'ZE', ko: '이스타항공', en: 'Eastar Jet', country: '대한민국', flag: '🇰🇷' },
  APZ: { iata: 'YP', ko: '에어프레미아', en: 'Air Premia', country: '대한민국', flag: '🇰🇷' },
  EOK: { iata: 'RF', ko: '에어로케이', en: 'Aero K', country: '대한민국', flag: '🇰🇷' },
  AIH: { iata: 'KJ', ko: '에어인천', en: 'Air Incheon', country: '대한민국', flag: '🇰🇷' },
  // Japan
  ANA: { iata: 'NH', ko: '전일본공수 (ANA)', en: 'All Nippon Airways', country: '일본', flag: '🇯🇵' },
  JAL: { iata: 'JL', ko: '일본항공 (JAL)', en: 'Japan Airlines', country: '일본', flag: '🇯🇵' },
  APJ: { iata: 'MM', ko: '피치항공', en: 'Peach Aviation', country: '일본', flag: '🇯🇵' },
  SKY: { iata: 'BC', ko: '스카이마크', en: 'Skymark Airlines', country: '일본', flag: '🇯🇵' },
  JJP: { iata: 'GK', ko: '젯스타 재팬', en: 'Jetstar Japan', country: '일본', flag: '🇯🇵' },
  TZP: { iata: 'ZG', ko: '집에어 도쿄', en: 'ZIPAIR Tokyo', country: '일본', flag: '🇯🇵' },
  NCA: { iata: 'KZ', ko: '일본화물항공', en: 'Nippon Cargo', country: '일본', flag: '🇯🇵' },
  // China / Taiwan / Hong Kong
  CCA: { iata: 'CA', ko: '중국국제항공', en: 'Air China', country: '중국', flag: '🇨🇳' },
  CES: { iata: 'MU', ko: '중국동방항공', en: 'China Eastern', country: '중국', flag: '🇨🇳' },
  CSN: { iata: 'CZ', ko: '중국남방항공', en: 'China Southern', country: '중국', flag: '🇨🇳' },
  CHH: { iata: 'HU', ko: '하이난항공', en: 'Hainan Airlines', country: '중국', flag: '🇨🇳' },
  CSZ: { iata: 'ZH', ko: '선전항공', en: 'Shenzhen Airlines', country: '중국', flag: '🇨🇳' },
  CXA: { iata: 'MF', ko: '샤먼항공', en: 'XiamenAir', country: '중국', flag: '🇨🇳' },
  CSC: { iata: '3U', ko: '쓰촨항공', en: 'Sichuan Airlines', country: '중국', flag: '🇨🇳' },
  DKH: { iata: 'HO', ko: '준야오항공', en: 'Juneyao Air', country: '중국', flag: '🇨🇳' },
  CQH: { iata: '9C', ko: '춘추항공', en: 'Spring Airlines', country: '중국', flag: '🇨🇳' },
  CDG: { iata: 'SC', ko: '산둥항공', en: 'Shandong Airlines', country: '중국', flag: '🇨🇳' },
  CPA: { iata: 'CX', ko: '캐세이퍼시픽', en: 'Cathay Pacific', country: '홍콩', flag: '🇭🇰' },
  HKE: { iata: 'UO', ko: '홍콩익스프레스', en: 'HK Express', country: '홍콩', flag: '🇭🇰' },
  CRK: { iata: 'HX', ko: '홍콩항공', en: 'Hong Kong Airlines', country: '홍콩', flag: '🇭🇰' },
  CAL: { iata: 'CI', ko: '중화항공', en: 'China Airlines', country: '대만', flag: '🇹🇼' },
  EVA: { iata: 'BR', ko: '에바항공', en: 'EVA Air', country: '대만', flag: '🇹🇼' },
  SJX: { iata: 'JX', ko: '스타럭스항공', en: 'STARLUX Airlines', country: '대만', flag: '🇹🇼' },
  TTW: { iata: 'IT', ko: '타이거에어 타이완', en: 'Tigerair Taiwan', country: '대만', flag: '🇹🇼' },
  // SE & South Asia & Oceania
  SIA: { iata: 'SQ', ko: '싱가포르항공', en: 'Singapore Airlines', country: '싱가포르', flag: '🇸🇬' },
  TGW: { iata: 'TR', ko: '스쿠트항공', en: 'Scoot', country: '싱가포르', flag: '🇸🇬' },
  THA: { iata: 'TG', ko: '타이항공', en: 'Thai Airways', country: '태국', flag: '🇹🇭' },
  HVN: { iata: 'VN', ko: '베트남항공', en: 'Vietnam Airlines', country: '베트남', flag: '🇻🇳' },
  VJC: { iata: 'VJ', ko: '비엣젯항공', en: 'VietJet Air', country: '베트남', flag: '🇻🇳' },
  PAL: { iata: 'PR', ko: '필리핀항공', en: 'Philippine Airlines', country: '필리핀', flag: '🇵🇭' },
  CEB: { iata: '5J', ko: '세부퍼시픽', en: 'Cebu Pacific', country: '필리핀', flag: '🇵🇭' },
  MAS: { iata: 'MH', ko: '말레이시아항공', en: 'Malaysia Airlines', country: '말레이시아', flag: '🇲🇾' },
  AXM: { iata: 'AK', ko: '에어아시아', en: 'AirAsia', country: '말레이시아', flag: '🇲🇾' },
  GIA: { iata: 'GA', ko: '가루다인도네시아', en: 'Garuda Indonesia', country: '인도네시아', flag: '🇮🇩' },
  AIC: { iata: 'AI', ko: '에어인디아', en: 'Air India', country: '인도', flag: '🇮🇳' },
  IGO: { iata: '6E', ko: '인디고항공', en: 'IndiGo', country: '인도', flag: '🇮🇳' },
  QFA: { iata: 'QF', ko: '콴타스항공', en: 'Qantas', country: '호주', flag: '🇦🇺' },
  JST: { iata: 'JQ', ko: '젯스타', en: 'Jetstar', country: '호주', flag: '🇦🇺' },
  VOZ: { iata: 'VA', ko: '버진 오스트레일리아', en: 'Virgin Australia', country: '호주', flag: '🇦🇺' },
  ANZ: { iata: 'NZ', ko: '에어뉴질랜드', en: 'Air New Zealand', country: '뉴질랜드', flag: '🇳🇿' },
  // Middle East
  UAE: { iata: 'EK', ko: '에미레이트항공', en: 'Emirates', country: '아랍에미리트', flag: '🇦🇪' },
  ETD: { iata: 'EY', ko: '에티하드항공', en: 'Etihad Airways', country: '아랍에미리트', flag: '🇦🇪' },
  FDB: { iata: 'FZ', ko: '플라이두바이', en: 'flydubai', country: '아랍에미리트', flag: '🇦🇪' },
  QTR: { iata: 'QR', ko: '카타르항공', en: 'Qatar Airways', country: '카타르', flag: '🇶🇦' },
  SVA: { iata: 'SV', ko: '사우디아항공', en: 'Saudia', country: '사우디아라비아', flag: '🇸🇦' },
  THY: { iata: 'TK', ko: '터키항공', en: 'Turkish Airlines', country: '튀르키예', flag: '🇹🇷' },
  PGT: { iata: 'PC', ko: '페가수스항공', en: 'Pegasus Airlines', country: '튀르키예', flag: '🇹🇷' },
  // Europe
  DLH: { iata: 'LH', ko: '루프트한자', en: 'Lufthansa', country: '독일', flag: '🇩🇪' },
  EWG: { iata: 'EW', ko: '유로윙스', en: 'Eurowings', country: '독일', flag: '🇩🇪' },
  AFR: { iata: 'AF', ko: '에어프랑스', en: 'Air France', country: '프랑스', flag: '🇫🇷' },
  BAW: { iata: 'BA', ko: '영국항공', en: 'British Airways', country: '영국', flag: '🇬🇧' },
  VIR: { iata: 'VS', ko: '버진애틀랜틱', en: 'Virgin Atlantic', country: '영국', flag: '🇬🇧' },
  EZY: { iata: 'U2', ko: '이지젯', en: 'easyJet', country: '영국', flag: '🇬🇧' },
  RYR: { iata: 'FR', ko: '라이언에어', en: 'Ryanair', country: '아일랜드', flag: '🇮🇪' },
  EIN: { iata: 'EI', ko: '에어링구스', en: 'Aer Lingus', country: '아일랜드', flag: '🇮🇪' },
  KLM: { iata: 'KL', ko: 'KLM 네덜란드항공', en: 'KLM', country: '네덜란드', flag: '🇳🇱' },
  SWR: { iata: 'LX', ko: '스위스국제항공', en: 'SWISS', country: '스위스', flag: '🇨🇭' },
  AUA: { iata: 'OS', ko: '오스트리아항공', en: 'Austrian Airlines', country: '오스트리아', flag: '🇦🇹' },
  FIN: { iata: 'AY', ko: '핀에어', en: 'Finnair', country: '핀란드', flag: '🇫🇮' },
  SAS: { iata: 'SK', ko: '스칸디나비아항공', en: 'SAS', country: '스웨덴', flag: '🇸🇪' },
  IBE: { iata: 'IB', ko: '이베리아항공', en: 'Iberia', country: '스페인', flag: '🇪🇸' },
  VLG: { iata: 'VY', ko: '부엘링항공', en: 'Vueling', country: '스페인', flag: '🇪🇸' },
  ITY: { iata: 'AZ', ko: 'ITA항공', en: 'ITA Airways', country: '이탈리아', flag: '🇮🇹' },
  LOT: { iata: 'LO', ko: 'LOT 폴란드항공', en: 'LOT Polish Airlines', country: '폴란드', flag: '🇵🇱' },
  WZZ: { iata: 'W6', ko: '위즈에어', en: 'Wizz Air', country: '헝가리', flag: '🇭🇺' },
  TAP: { iata: 'TP', ko: 'TAP 포르투갈항공', en: 'TAP Air Portugal', country: '포르투갈', flag: '🇵🇹' },
  // Americas
  UAL: { iata: 'UA', ko: '유나이티드항공', en: 'United Airlines', country: '미국', flag: '🇺🇸' },
  DAL: { iata: 'DL', ko: '델타항공', en: 'Delta Air Lines', country: '미국', flag: '🇺🇸' },
  AAL: { iata: 'AA', ko: '아메리칸항공', en: 'American Airlines', country: '미국', flag: '🇺🇸' },
  SWA: { iata: 'WN', ko: '사우스웨스트항공', en: 'Southwest Airlines', country: '미국', flag: '🇺🇸' },
  ASA: { iata: 'AS', ko: '알래스카항공', en: 'Alaska Airlines', country: '미국', flag: '🇺🇸' },
  JBU: { iata: 'B6', ko: '젯블루', en: 'JetBlue', country: '미국', flag: '🇺🇸' },
  HAL: { iata: 'HA', ko: '하와이안항공', en: 'Hawaiian Airlines', country: '미국', flag: '🇺🇸' },
  FDX: { iata: 'FX', ko: '페덱스 화물', en: 'FedEx Express', country: '미국', flag: '🇺🇸' },
  UPS: { iata: '5X', ko: 'UPS 화물', en: 'UPS Airlines', country: '미국', flag: '🇺🇸' },
  GTI: { iata: '5Y', ko: '아틀라스항공', en: 'Atlas Air', country: '미국', flag: '🇺🇸' },
  ACA: { iata: 'AC', ko: '에어캐나다', en: 'Air Canada', country: '캐나다', flag: '🇨🇦' },
  WJA: { iata: 'WS', ko: '웨스트젯', en: 'WestJet', country: '캐나다', flag: '🇨🇦' },
  AMX: { iata: 'AM', ko: '아에로멕시코', en: 'Aeromexico', country: '멕시코', flag: '🇲🇽' },
  LAN: { iata: 'LA', ko: '라탐항공', en: 'LATAM Airlines', country: '칠레', flag: '🇨🇱' },
  TAM: { iata: 'JJ', ko: '라탐 브라질', en: 'LATAM Brasil', country: '브라질', flag: '🇧🇷' },
  AZU: { iata: 'AD', ko: '아줄 브라질항공', en: 'Azul', country: '브라질', flag: '🇧🇷' },
  // Africa
  ETH: { iata: 'ET', ko: '에티오피아항공', en: 'Ethiopian Airlines', country: '에티오피아', flag: '🇪🇹' },
  MSR: { iata: 'MS', ko: '이집트항공', en: 'EgyptAir', country: '이집트', flag: '🇪🇬' },
  RAM: { iata: 'AT', ko: '로열에어모로코', en: 'Royal Air Maroc', country: '모로코', flag: '🇲🇦' }
};

/**
 * Resolve nationality from a 6-char ICAO24 hex address (ICAO Annex 10 Table 9-1).
 */
export function lookupCountryFromIcao24(icao24) {
  if (!icao24) return null;
  const num = parseInt(String(icao24).trim(), 16);
  if (!Number.isFinite(num)) return null;
  for (let i = 0; i < ICAO24_RANGES.length; i++) {
    const [start, end, iso, nameKo, nameEn, flag] = ICAO24_RANGES[i];
    if (num >= start && num <= end) {
      return { iso, nameKo, nameEn, flag };
    }
  }
  return null;
}

/**
 * Refine country using aircraft tail registration (distinguishes Hong Kong / Taiwan from mainland China).
 */
export function lookupCountryFromRegistration(reg) {
  const r = String(reg || '').trim().toUpperCase();
  if (!r) return null;
  if (/^B-[HKL]/.test(r)) return { iso: 'HK', nameKo: '홍콩', nameEn: 'Hong Kong', flag: '🇭🇰' };
  if (/^B-(16|18|22|28|50|58)\d/.test(r)) return { iso: 'TW', nameKo: '대만', nameEn: 'Taiwan', flag: '🇹🇼' };
  if (/^HL\d/.test(r)) return { iso: 'KR', nameKo: '대한민국', nameEn: 'South Korea', flag: '🇰🇷' };
  if (/^JA\d/.test(r)) return { iso: 'JP', nameKo: '일본', nameEn: 'Japan', flag: '🇯🇵' };
  return null;
}

/**
 * Normalize raw country string, registration, and ICAO24 hex into a display-ready nationality object.
 */
export function resolveAircraftCountry(icao24, registration = '', rawCountry = '') {
  const fromReg = lookupCountryFromRegistration(registration);
  if (fromReg) return fromReg;

  const cleanRaw = String(rawCountry || '').trim();
  const isFeedPlaceholder = !cleanRaw || /live|ads-?b|unknown|transponder/i.test(cleanRaw);
  if (!isFeedPlaceholder) {
    const mapped = COUNTRY_NAME_MAP.get(cleanRaw.toLowerCase());
    if (mapped) return { ...mapped, nameEn: cleanRaw };
  }

  const fromHex = lookupCountryFromIcao24(icao24);
  if (fromHex) return fromHex;

  if (!isFeedPlaceholder) {
    return { iso: null, nameKo: cleanRaw, nameEn: cleanRaw, flag: '🌐' };
  }
  return { iso: null, nameKo: '미상', nameEn: 'Unknown', flag: '🌐' };
}

/**
 * Decode an ICAO callsign (e.g. "KAL081") into airline name & IATA flight number (e.g. "KE81").
 */
export function decodeCallsign(callsign) {
  const cs = String(callsign || '').trim().toUpperCase();
  const m = cs.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  if (!m) return null;
  const icaoCode = m[1];
  const rawNum = m[2];
  const numClean = rawNum.replace(/^0+(?=\d)/, '');
  const info = AIRLINES_ICAO[icaoCode];
  if (!info) {
    return {
      icaoCode,
      iataCode: null,
      flightNumber: numClean,
      iataFlight: null,
      airlineKo: null,
      airlineEn: null
    };
  }
  return {
    icaoCode,
    iataCode: info.iata,
    flightNumber: numClean,
    iataFlight: `${info.iata}${numClean}`,
    airlineKo: info.ko,
    airlineEn: info.en,
    airlineCountry: info.country,
    airlineFlag: info.flag
  };
}
