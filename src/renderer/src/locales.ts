/** MORU Korean/English display strings. No network translation service required. */
export type Language = 'ko' | 'en'

const korean = {
  navHome: '홈',
  navDiscover: '모드 다운로드',
  navInstalled: '내 모드',
  navSettings: '설정',
  menu: '메뉴',
  profile: '내 프로필',
  heroSubtitle: 'MORU와 함께하는 새로운 마인크래프트 경험',
  play: 'PLAY',
  environment: '게임 환경',
  minecraft: 'Minecraft',
  modLoader: '모드 로더',
  modCount: '내 모드',
  zeroMods: '0개',
  discoverTitle: '모드 다운로드',
  searchPlaceholder: '모드 이름 검색...',
  search: '검색',
  searching: '불러오는 중...',
  recommended: '추천 모드',
  searchResults: '검색 결과',
  sortedByDownloads: 'Modrinth 다운로드순',
  shownCount: '개 표시',
  loadingMods: '모드를 불러오는 중...',
  emptySearch: '조건에 맞는 모드를 찾지 못했습니다.',
  failedSearch: '모드를 불러오지 못했습니다.',
  downloadsUnit: '회',
  emptyInstalled: '설치된 모드가 없습니다.',
  settingsTitle: '클라이언트 설정',
  gameVersion: '게임 버전',
  memoryAllocation: '메모리 할당',
  memoryHelp: '게임에 사용할 RAM 용량',
  language: '언어 / Language',
  languageHelp: '클라이언트의 표시 언어를 선택하세요.',
  languageKorean: '한국어',
  languageEnglish: 'English',
  font: '글꼴',
  fontHelp: 'TTF 파일을 선택해 클라이언트 글꼴을 변경합니다.',
  fontChooseFile: '파일 선택',
  fontDefault: '기본 글꼴',
  fontReset: '기본값으로',
  fontInvalidFile: '올바른 TTF 파일을 선택하세요.',
  fontTooLarge: '25MB 이하의 TTF 파일을 선택하세요.',
  fontLoadError: '저장된 글꼴을 불러오지 못했습니다.',
  fontSaveError: '글꼴을 적용하거나 저장하지 못했습니다.',
  fontResetError: '기본 글꼴로 되돌리지 못했습니다.'
} as const

export type TranslationKey = keyof typeof korean

const english: Record<TranslationKey, string> = {
  navHome: 'Home',
  navDiscover: 'Download Mods',
  navInstalled: 'My Mods',
  navSettings: 'Settings',
  menu: 'MENU',
  profile: 'My Profile',
  heroSubtitle: 'A new Minecraft experience with MORU',
  play: 'PLAY',
  environment: 'Game Environment',
  minecraft: 'Minecraft',
  modLoader: 'Mod Loader',
  modCount: 'My Mods',
  zeroMods: '0 mods',
  discoverTitle: 'Download Mods',
  searchPlaceholder: 'Search mods by name...',
  search: 'Search',
  searching: 'Loading...',
  recommended: 'Recommended Mods',
  searchResults: 'Search Results',
  sortedByDownloads: 'Most downloaded on Modrinth',
  shownCount: 'results shown',
  loadingMods: 'Loading mods...',
  emptySearch: 'No mods found for these filters.',
  failedSearch: 'Unable to load mods.',
  downloadsUnit: 'downloads',
  emptyInstalled: 'No mods installed yet.',
  settingsTitle: 'Client Settings',
  gameVersion: 'Game Version',
  memoryAllocation: 'Memory Allocation',
  memoryHelp: 'Amount of RAM allocated to Minecraft',
  language: 'Language / 언어',
  languageHelp: 'Choose the client display language.',
  languageKorean: '한국어',
  languageEnglish: 'English',
  font: 'Font',
  fontHelp: 'Choose a TTF file to change the launcher font.',
  fontChooseFile: 'Choose file',
  fontDefault: 'Default font',
  fontReset: 'Reset',
  fontInvalidFile: 'Please select a valid TTF file.',
  fontTooLarge: 'Please select a TTF file smaller than 25 MB.',
  fontLoadError: 'Could not load the saved font.',
  fontSaveError: 'Could not apply or save the font.',
  fontResetError: 'Could not reset the font.'
}

const translations: Record<Language, Record<TranslationKey, string>> = {
  ko: korean,
  en: english
}

export function translate(language: Language, key: TranslationKey): string {
  return translations[language][key]
}

/**
 * Original Modrinth titles remain unchanged. These short descriptions are
 * MORU-authored summaries for commonly encountered projects. This is not
 * machine translation; projects absent from the list retain their original
 * Modrinth descriptions.
 */
const koreanModDescriptions: Record<string, string> = {
  sodium: '마인크래프트의 렌더링 성능을 개선해 프레임 속도와 화면 표시의 효율을 높이는 모드입니다.',
  sodiumextra: 'Sodium에 다양한 그래픽 및 성능 관련 추가 설정을 제공하는 모드입니다.',
  reesessodiumoptions: 'Sodium의 비디오 설정 화면을 더 편리하게 구성하는 모드입니다.',
  lithium: '게임의 물리·AI·틱 연산 등 내부 처리 성능을 최적화하는 모드입니다.',
  ferritecore: '메모리 사용량을 줄여 게임의 RAM 효율을 개선하는 모드입니다.',
  iris: '호환되는 셰이더팩을 사용할 수 있도록 지원하는 셰이더 모드입니다.',
  irisshaders: '호환되는 셰이더팩을 사용할 수 있도록 지원하는 셰이더 모드입니다.',
  modmenu: '설치한 Fabric 모드의 목록과 설정을 게임 안에서 확인할 수 있습니다.',
  fabricapi: '여러 Fabric 모드가 필요로 하는 공통 기능을 제공하는 라이브러리입니다.',
  clothconfigapi: '모드 설정 메뉴를 만들기 위한 공통 라이브러리입니다.',
  entityculling: '보이지 않는 엔티티의 렌더링을 줄여 성능을 개선하는 모드입니다.',
  immediatelyfast: '화면의 일부 렌더링 작업을 최적화해 성능 향상을 돕습니다.',
  continuity: '연결 텍스처 등 리소스팩의 추가 렌더링 기능을 지원하는 모드입니다.',
  lambdynamiclights: '손에 든 횃불 등 빛나는 물체에 동적인 광원 효과를 추가합니다.',
  dynamicfps: '게임이 백그라운드에 있을 때 자원 사용을 줄이는 모드입니다.',
  appleskin: '음식의 허기 및 포만감 관련 정보를 게임 화면에 표시합니다.',
  jade: '바라보는 블록이나 엔티티에 대한 정보를 표시하는 모드입니다.',
  zoomify: '게임 화면을 부드럽게 확대해 볼 수 있는 기능을 제공합니다.',
  xaerosminimap: '화면에 미니맵을 추가해 주변 지형과 위치를 확인할 수 있습니다.',
  xaerosworldmap: '탐험한 지역을 확인할 수 있는 월드맵 기능을 제공합니다.',
  emi: '아이템과 제작법을 검색하고 확인할 수 있도록 돕는 모드입니다.',
  rei: '아이템 목록과 제작법을 확인하는 편의 기능을 제공합니다.',
  jei: '아이템과 제작법을 검색하고 확인할 수 있는 모드입니다.',
  betterf3: 'F3 디버그 정보 화면을 더 알아보기 쉽게 표시합니다.',
  notenoughanimations: '플레이어 동작에 다양한 시각적 애니메이션을 추가합니다.',
  shulkerboxtooltip: '셜커 상자 안의 아이템을 간편하게 미리 볼 수 있도록 합니다.',
  mousetweaks: '마우스로 인벤토리의 아이템을 더 편리하게 옮길 수 있도록 합니다.',
  debugify: '기존 게임의 여러 알려진 오류를 수정하는 데 도움을 주는 모드입니다.',
  yetanotherconfiglib: '모드 설정 화면을 위한 공통 구성요소를 제공하는 라이브러리입니다.',
  architecturyapi: '여러 모드가 공통 기능을 활용할 수 있도록 하는 라이브러리입니다.',
  fabriclanguagekotlin: 'Kotlin으로 제작된 Fabric 모드를 실행할 수 있도록 지원합니다.',
  litematica: '건축 설계도를 불러오고 배치 작업을 보조하는 기능을 제공합니다.',
  minihud: '게임 화면에 다양한 추가 정보와 안내 표시를 제공합니다.',
  tweakeroo: '게임 조작과 건축 작업을 돕는 다양한 편의 기능을 제공합니다.'
}

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function localizedModDescription(
  mod: { name: string; description: string },
  language: Language
): string {
  if (language === 'ko') {
    return koreanModDescriptions[normalizedName(mod.name)] ?? mod.description
  }
  return mod.description
}
