'use client'
// 출석·장소 탭: 정규 세션 장소와 출석 시간 / 평일 세션 진행 여부와 조별 일정·장소
import { useState } from 'react'
import { ExternalLink, MapPin, Plus, Star, Trash2 } from 'lucide-react'
import { Button, Field, HelpTip, inputClass } from '@/app/components/ui'
import { formatKst, fromKstInput } from '@/lib/semester'
import { range } from '../_lib'

export function DateTimeInput({ id, label, value, onChange, disabled, changed, hint, tone }) {
  const iso = fromKstInput(value)
  const tones = { green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700' }
  return (
    <Field label={<span className={tones[tone] || ''}>{label}</span>} htmlFor={id} hint={hint || (iso ? `한국 시간 ${formatKst(iso)}` : '비워 두면 설정하지 않은 것으로 봅니다.')}>
      <div className="flex gap-1.5">
        <input id={id} type="datetime-local" value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`${inputClass} ${changed ? 'border-amber-400 bg-amber-50/40' : ''}`} />
        {value && !disabled && (
          <button type="button" onClick={() => onChange('')} className="shrink-0 rounded-md border border-slate-300 px-2 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-red-600" aria-label={`${typeof label === 'string' ? label : ''} 지우기`}>지우기</button>
        )}
      </div>
    </Field>
  )
}

function mapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
}

export function LocationEditor({ idPrefix, location, onChange, favorites, disabled, onAddFavorite }) {
  const [favoriteName, setFavoriteName] = useState('')
  const lat = location?.lat ?? ''
  const lng = location?.lng ?? ''
  const radius = location?.radius ?? 100
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="자주 쓰는 장소" htmlFor={`${idPrefix}-favorite`} className="min-w-[200px] flex-1">
          <select
            id={`${idPrefix}-favorite`}
            value=""
            disabled={disabled || favorites.length === 0}
            onChange={(event) => {
              const favorite = favorites.find((item) => String(item.id) === event.target.value)
              if (favorite) onChange({ lat: favorite.lat, lng: favorite.lng, radius: favorite.radius || 100 })
            }}
            className={inputClass}
          >
            <option value="">{favorites.length ? '장소 불러오기…' : '저장된 장소 없음'}</option>
            {favorites.map((favorite) => <option key={favorite.id} value={favorite.id}>{favorite.name}</option>)}
          </select>
        </Field>
        {lat && lng && (
          <a href={mapsLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <MapPin className="h-4 w-4" aria-hidden="true" />지도에서 확인<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="위도" htmlFor={`${idPrefix}-lat`} hint="예: 37.5825">
          <input id={`${idPrefix}-lat`} type="number" inputMode="decimal" step="any" value={lat} onChange={(event) => onChange({ lat: event.target.value, lng, radius })} disabled={disabled} className={inputClass} />
        </Field>
        <Field label="경도" htmlFor={`${idPrefix}-lng`} hint="예: 127.0262">
          <input id={`${idPrefix}-lng`} type="number" inputMode="decimal" step="any" value={lng} onChange={(event) => onChange({ lat, lng: event.target.value, radius })} disabled={disabled} className={inputClass} />
        </Field>
        <Field label="허용 반경 (m)" htmlFor={`${idPrefix}-radius`} hint="10~2000m">
          <input id={`${idPrefix}-radius`} type="number" min="10" max="2000" value={radius} onChange={(event) => onChange({ lat, lng, radius: event.target.value === '' ? '' : Number(event.target.value) })} disabled={disabled} className={inputClass} />
        </Field>
      </div>
      {onAddFavorite && lat && lng && !disabled && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!favoriteName.trim()) return
            onAddFavorite({ id: Date.now(), name: favoriteName.trim(), lat, lng, radius: Number(radius) || 100 })
            setFavoriteName('')
          }}
        >
          <Field label="이 좌표를 자주 쓰는 장소로 저장" htmlFor={`${idPrefix}-favorite-name`} className="min-w-[200px] flex-1">
            <input id={`${idPrefix}-favorite-name`} value={favoriteName} onChange={(event) => setFavoriteName(event.target.value)} placeholder="예: 경영대 58동 101호" className={inputClass} />
          </Field>
          <Button type="submit" icon={Star} disabled={!favoriteName.trim()}>추가</Button>
        </form>
      )}
    </div>
  )
}

export default function AttendanceTab({ week, mode, current, changes, canWrite, setDeadline, updateSetup, setupView, favorites, setFavorites, baseFavorites }) {
  const changedDeadline = (key) => changes.includes(`deadline:${key}`)

  function addFavorite(favorite) {
    setFavorites([...(favorites || []), favorite])
  }

  function removeFavorite(id) {
    if (!confirm('이 장소를 자주 쓰는 장소에서 지울까요? (이미 저장된 주차의 좌표는 그대로입니다)')) return
    setFavorites((favorites || []).filter((item) => item.id !== id))
  }

  function updateTeam(group, patch) {
    updateSetup((setup) => ({ ...setup, weekday: { ...(setup.weekday || {}), [group]: { ...((setup.weekday || {})[group] || {}), ...patch } } }))
  }

  const favoritesChanged = JSON.stringify(favorites) !== JSON.stringify(baseFavorites)

  return (
    <div className="space-y-8">
      {mode === 'regular' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-900">
              W{week} 출석 장소
              <HelpTip label="출석 장소 설명">학회원이 출석 버튼을 누를 때 휴대폰 위치가 이 좌표에서 허용 반경 안이어야 출석으로 인정됩니다.</HelpTip>
            </h3>
            <LocationEditor
              idPrefix="regular-location"
              location={setupView.location}
              favorites={favorites || []}
              disabled={!canWrite}
              onChange={(location) => updateSetup((setup) => ({ ...setup, location }))}
              onAddFavorite={addFavorite}
            />
          </section>
          <section className="space-y-3">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-900">
              W{week} 출석 시간 (한국 시간)
              <HelpTip label="출석 시간 설명">출석 오픈부터 출석할 수 있고, 세션 시작 이후는 지각, 출석 종료 이후 기록이 없으면 자동으로 결석 처리됩니다(인정된 사유서가 있으면 인정 결석).</HelpTip>
            </h3>
            <DateTimeInput id="attendance-start" label="출석 오픈" tone="green" value={current.deadlines.attendance_start} onChange={(value) => setDeadline('attendance_start', value)} disabled={!canWrite} changed={changedDeadline('attendance_start')} />
            <DateTimeInput id="session-start" label="세션 시작 (이후 지각)" tone="amber" value={current.deadlines.session_start} onChange={(value) => setDeadline('session_start', value)} disabled={!canWrite} changed={changedDeadline('session_start')} />
            <DateTimeInput id="attendance-end" label="출석 종료 (이후 결석)" tone="red" value={current.deadlines.attendance_end} onChange={(value) => setDeadline('attendance_end', value)} disabled={!canWrite} changed={changedDeadline('attendance_end')} />
          </section>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">W{week} 평일 세션 진행</p>
              <p className="text-sm text-slate-600">기업 세션 등으로 평일 세션이 없는 주차는 끄세요.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
              <input type="checkbox" checked={setupView.weekdaySession} onChange={(event) => updateSetup((setup) => ({ ...setup, weekdaySession: event.target.checked }))} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />
              {setupView.weekdaySession ? '진행' : '진행 안 함'}
            </label>
          </div>
          {setupView.weekdaySession && (
            <>
              <p className="text-sm leading-6 text-slate-600">조마다 날짜·시간·장소가 다를 수 있습니다. 조 구성은 조·팀·평가 편성 탭의 평일 편성에서 정합니다. 시간은 한국 시간 기준입니다.</p>
              <div className="grid gap-4 xl:grid-cols-2">
                {range(setupView.weekdayGroupCount).map((group) => {
                  const team = setupView.weekday?.[group] || {}
                  return (
                    <div key={group} className="space-y-3 rounded-md border border-slate-200 p-4">
                      <h4 className="text-sm font-bold text-teal-800">평일 {group}조</h4>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="진행 날짜" htmlFor={`team-${group}-date`}><input id={`team-${group}-date`} type="date" value={team.date || ''} onChange={(event) => updateTeam(group, { date: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                        <Field label="출석 오픈" htmlFor={`team-${group}-open`}><input id={`team-${group}-open`} type="time" value={team.attOpen || ''} onChange={(event) => updateTeam(group, { attOpen: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                        <Field label="세션 시작" htmlFor={`team-${group}-start`}><input id={`team-${group}-start`} type="time" value={team.sessionStart || ''} onChange={(event) => updateTeam(group, { sessionStart: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                        <Field label="출석 마감" htmlFor={`team-${group}-end`}><input id={`team-${group}-end`} type="time" value={team.attEnd || ''} onChange={(event) => updateTeam(group, { attEnd: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                      </div>
                      <LocationEditor
                        idPrefix={`team-${group}-location`}
                        location={{ lat: team.lat ?? '', lng: team.lng ?? '', radius: team.radius ?? 100 }}
                        favorites={favorites || []}
                        disabled={!canWrite}
                        onChange={(location) => updateTeam(group, location)}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">자주 쓰는 장소 {favoritesChanged && <span className="ml-1 text-xs font-bold text-amber-700">(저장 안 됨)</span>}</h3>
        {(favorites || []).length === 0 ? (
          <p className="text-sm text-slate-500">저장된 장소가 없습니다. 좌표를 입력한 뒤 이름을 붙여 저장하세요.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {favorites.map((favorite) => (
              <li key={favorite.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm">
                <span className="font-semibold text-slate-800">{favorite.name}</span>
                <span className="text-xs text-slate-500">{favorite.radius || 100}m</span>
                {canWrite && (
                  <button type="button" onClick={() => removeFavorite(favorite.id)} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`${favorite.name} 삭제`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && <p className="flex items-center gap-1 text-xs text-slate-500"><Plus className="h-3 w-3" aria-hidden="true" />장소 목록은 모든 주차가 함께 씁니다. 저장 버튼을 눌러야 반영됩니다.</p>}
      </section>
    </div>
  )
}
