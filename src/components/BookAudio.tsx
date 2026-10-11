import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Headphones, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AudioChapter, AudioRequest, BookNarrator, idleAudioState } from '../utils/bookNarrator'

type BookAudioContextValue = {
  supported: boolean
  listenChapter: (chapter: AudioChapter, markdown: string) => void
  listenSection: (chapter: AudioChapter, markdown: string, index: number) => void
  listenBook: (file?: string, markdown?: string) => void
}
const BookAudioContext = createContext<BookAudioContextValue | null>(null)
export function useBookAudio(): BookAudioContextValue {
  const context = useContext(BookAudioContext)
  if (!context) throw new Error('BookAudioProvider is required')
  return context
}

function preference(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
function savePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* Listening works without storage. */ }
}
const RATES = [0.75, 1, 1.25, 1.5, 2]
const RATE_KEY = 'mindful-book:audio-rate'
const VOICE_KEY = 'mindful-book:audio-voice'

/** Shared by the directory and reader, so turning pages does not interrupt listening. */
export function BookAudioProvider({ chapters, children }: { chapters: readonly AudioChapter[]; children: React.ReactNode }): JSX.Element {
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState(idleAudioState)
  const [queue, setQueue] = useState<readonly AudioChapter[]>([])
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [rate, setRate] = useState(() => RATES.includes(Number(preference(RATE_KEY))) ? Number(preference(RATE_KEY)) : 1)
  const [voiceURI, setVoiceURI] = useState(() => preference(VOICE_KEY))
  const narrator = useRef<BookNarrator | null>(null)

  useEffect(() => {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return
    const synth = window.speechSynthesis
    const engine = new BookNarrator(synth, text => new SpeechSynthesisUtterance(text), async (chapter, signal) => {
      const response = await fetch(`${import.meta.env.BASE_URL}first-book/${encodeURIComponent(chapter.file)}`, { signal })
      if (!response.ok) throw new Error('load failed')
      return response.text()
    }, setState)
    narrator.current = engine
    setSupported(true)
    const updateVoices = () => setVoices(synth.getVoices().filter(voice => /^(zh|cmn)([-_]|$)/i.test(voice.lang)))
    updateVoices()
    synth.addEventListener('voiceschanged', updateVoices)
    return () => {
      synth.removeEventListener('voiceschanged', updateVoices)
      engine.destroy()
      narrator.current = null
    }
  }, [])

  useEffect(() => {
    const voice = voices.find(item => item.voiceURI === voiceURI)
      ?? voices.find(item => /^zh[-_]CN$/i.test(item.lang))
      ?? voices[0] ?? null
    narrator.current?.configure(rate, voice)
  }, [rate, voiceURI, voices])

  const start = (request: AudioRequest) => {
    if (!narrator.current) return
    setQueue(request.chapters)
    narrator.current.start(request)
  }
  const context: BookAudioContextValue = {
    supported,
    listenChapter: (chapter, markdown) => start({ chapters: [chapter], markdown, mode: 'chapter' }),
    listenSection: (chapter, markdown, sectionIndex) => start({ chapters: [chapter], markdown, mode: 'section', sectionIndex }),
    listenBook: (file, markdown) => start({ chapters, markdown, mode: 'book', startIndex: Math.max(0, chapters.findIndex(chapter => chapter.file === file)) }),
  }
  const active = state.status !== 'idle'
  const progress = state.chunkCount ? Math.round(state.chunkIndex / state.chunkCount * 100) : 0
  const loading = state.status === 'loading'
  const paused = state.status === 'paused'
  const completed = state.status === 'finished'
  const failed = state.status === 'error'
  const statusLabel = loading ? '正在准备' : paused ? '已暂停' : completed ? '已听完' : failed ? '播放中断' : '正在朗读'

  return (
    <BookAudioContext.Provider value={context}>
      <div className={`book-audio-scope${active ? ' book-audio-scope--active' : ''}`}>
        {children}
        {active && <aside className="book-audio-player" aria-label="听书播放器">
          <div className="book-audio-player__heading">
            <Headphones size={20} aria-hidden="true" />
            <div className="book-audio-player__title">
              <p aria-live="polite">{statusLabel} · {state.mode === 'book' ? `全书连播 ${state.chapterIndex + 1}/${state.chapterCount}` : state.mode === 'section' ? '本节' : '本章'}</p>
              <Link to={`/first-book/read/${encodeURIComponent(state.chapter?.file ?? '')}`}>{state.chapter?.no} · {state.sectionTitle || state.chapter?.title}</Link>
            </div>
            <button className="book-audio-icon-button" type="button" onClick={() => narrator.current?.stop()} aria-label="停止听书"><X size={20} aria-hidden="true" /></button>
          </div>
          {failed ? <p className="book-audio-player__error" role="alert">{state.error}</p>
            : <div className="book-audio-player__progress"><progress max={100} value={progress} aria-label="本篇听书进度" /><span>{progress}%</span></div>}
          <div className="book-audio-player__controls">
            <div className="book-audio-player__transport">
              <button className="book-audio-icon-button" type="button" aria-label="上一段" disabled={loading || completed || failed || state.chunkIndex === 0} onClick={() => narrator.current?.moveChunk(-1)}><SkipBack size={19} aria-hidden="true" /></button>
              {failed || completed
                ? <button className="book-audio-toggle" type="button" onClick={() => narrator.current?.retry()}><RotateCcw size={17} aria-hidden="true" />{completed ? '重新听' : '重试'}</button>
                : <button className="book-audio-toggle" type="button" onClick={() => paused ? narrator.current?.resume() : narrator.current?.pause()}>{paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{paused ? '继续' : '暂停'}</button>}
              <button className="book-audio-icon-button" type="button" aria-label="下一段" disabled={loading || completed || failed || (state.chunkIndex >= state.chunkCount - 1 && state.chapterIndex >= state.chapterCount - 1)} onClick={() => narrator.current?.moveChunk(1)}><SkipForward size={19} aria-hidden="true" /></button>
            </div>
            <label className="book-audio-player__setting">语速<select aria-label="听书语速" value={rate} onChange={event => {
              const next = Number(event.target.value); setRate(next); savePreference(RATE_KEY, String(next))
            }}>{RATES.map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
            <details className="book-audio-player__settings">
              <summary>更多设置</summary>
              <div>
                <label>音色<select aria-label="听书音色" value={voices.some(voice => voice.voiceURI === voiceURI) ? voiceURI : ''} onChange={event => {
                  setVoiceURI(event.target.value); savePreference(VOICE_KEY, event.target.value)
                }}><option value="">自动选择中文音色</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}（{voice.lang}）</option>)}</select></label>
                {state.mode === 'book' && <label>篇章<select aria-label="切换听书篇章" value={state.chapterIndex} onChange={event => narrator.current?.jumpChapter(Number(event.target.value))}>
                  {queue.map((chapter, index) => <option key={chapter.file} value={index}>{chapter.no} · {chapter.title}</option>)}
                </select></label>}
                <p>使用设备语音，音色随设备而异。暂停后从当前短段继续；锁屏或切到后台可能中断。</p>
              </div>
            </details>
          </div>
        </aside>}
      </div>
    </BookAudioContext.Provider>
  )
}
