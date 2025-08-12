import type { Translation } from '../i18n-types';

const ko: Translation = {
	header: {
		title: 'JSON 에디터',
		clear: '지우기',
		copy: '복사',
		copySuccess: '클립보드에 복사됨',
		copyError: '클립보드 복사 실패',
		format: '정렬',
		minify: '축소',
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
		bodyDescription: 'POST/PUT/PATCH 요청에 사용할 본문을 설정합니다.',
		bodyPlaceholder: '요청 본문 입력 (JSON, XML 등)',
		useEditorContent: '에디터 내용을 요청 본문으로 사용',
		sendAsRawText: '원시 텍스트로 전송 (JSON 파싱하지 않음)',
		clearAll: '모두 지우기',
		clearAllConfirm: '모든 설정을 지우시겠습니까? 저장된 헤더, 본문, URL이 모두 삭제됩니다.',
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
