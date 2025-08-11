import type { Translation } from '../i18n-types';

const ko: Translation = {
	header: {
		title: 'JSON 에디터',
		format: '정렬',
		minify: '축소',
		clear: '지우기',
		sample: '샘플 데이터',
		language: '언어'
	},
	editor: {
		placeholder: 'JSON 데이터를 입력하세요...',
		invalidJson: '잘못된 JSON',
		validJson: '유효한 JSON',
		urlPlaceholder: 'JSON을 가져올 URL 입력...',
		urlRequired: 'URL이 필요합니다',
		fetchError: '데이터를 가져오는데 실패했습니다',
		go: '가져오기',
		requestSettings: '요청 설정',
		requestSettingsDescription: 'HTTP 헤더와 요청 본문을 설정합니다',
		headers: '헤더',
		headerKey: '헤더 키',
		headerValue: '헤더 값',
		addHeader: '헤더 추가',
		body: '본문',
		bodyDescription:
			'선택적 요청 본문입니다. 비어있으면 POST/PUT/PATCH 요청시 에디터 내용이 사용됩니다.',
		bodyPlaceholder: '요청 본문 입력 (JSON, XML 등)',
		cancel: '취소',
		save: '저장'
	},
	graph: {
		showMore: '{count} 개 더 보기',
		showLess: '간략하게 보기',
		expand: '펼치기',
		collapse: '접기',
		expandAll: '모두 펼치기'
	},
	languages: {
		en: 'English',
		ko: '한국어',
		ja: '日本語'
	},
	footer: {
		ready: '준비됨'
	}
} satisfies Translation;

export default ko;
