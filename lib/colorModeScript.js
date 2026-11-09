// 서버 레이아웃에서도 읽을 수 있게 React를 쓰지 않는 파일에 둔다 (lib/colorMode.js 참고)
export const COLOR_MODE_KEY = 'ig-color-mode'

// <head>에서 바로 실행하는 스크립트 (React보다 먼저). 기기 설정이 바뀌면 따라간다.
export const COLOR_MODE_SCRIPT = `(function(){try{var q=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){var m=null;try{m=localStorage.getItem('${COLOR_MODE_KEY}')}catch(e){}var d=m==='dark'||(m!=='light'&&q.matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')};a();q.addEventListener('change',a);window.addEventListener('storage',function(e){if(e.key==='${COLOR_MODE_KEY}')a()})}catch(e){}})()`

