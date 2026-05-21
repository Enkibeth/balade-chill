'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Lightbulb, Eye, Check, Stethoscope } from 'lucide-react'
import type { Etape, ThemeColor } from '@/types'
import { CipherBlock } from './CipherBlock'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

function Reveal({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export interface EtapeCardProps {
  etape: Etape
  theme: ThemeColor
  enigmeSolved: boolean
  medicalCorrect: boolean
  missionDone: boolean
  onToggleEnigme: () => void
  onToggleMedical: () => void
  onToggleMission: () => void
}

export function EtapeCard({
  etape,
  theme,
  enigmeSolved,
  medicalCorrect,
  missionDone,
  onToggleEnigme,
  onToggleMedical,
  onToggleMission,
}: EtapeCardProps) {
  const [showHint, setShowHint] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showMedical, setShowMedical] = useState(false)

  return (
    <article
      id={`etape-${etape.order}`}
      className="overflow-hidden rounded-2xl border border-amber-200/12 bg-black/30"
    >
      <header
        className="flex items-center gap-4 px-5 py-4"
        style={{ backgroundColor: theme.primary }}
      >
        <span className="font-mono text-3xl italic text-white/30">
          {ROMAN[etape.order] ?? etape.order}
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/55">
            Étape {etape.order} · {etape.walk_minutes} min de marche
          </p>
          <h3 className="text-lg text-white">{etape.location_name}</h3>
        </div>
      </header>

      <div className="space-y-5 p-5">
        {etape.story_text && (
          <p className="parchment rounded-lg border-l-2 px-4 py-3 text-sm italic leading-relaxed"
             style={{ borderColor: theme.accent }}>
            {etape.story_text}
          </p>
        )}

        {etape.direction_text && (
          <div className="rounded-lg border border-amber-200/10 bg-black/30 p-3">
            <p className="flex items-start gap-2 text-sm text-amber-100/65">
              <MapPin size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <span>{etape.direction_text}</span>
            </p>
            {etape.maps_url && (
              <a
                href={etape.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded bg-[#1a73e8] px-3 py-1.5 text-xs text-white"
              >
                <MapPin size={13} /> Ouvrir dans Google Maps
              </a>
            )}
          </div>
        )}

        {/* Énigme */}
        <section
          className="rounded-lg border p-4"
          style={{ borderColor: theme.primary }}
        >
          <p
            className="mb-2 text-[10px] uppercase tracking-[0.25em]"
            style={{ color: theme.secondary }}
          >
            🔐 Énigme · {etape.enigme.title}
          </p>
          <p className="text-sm leading-relaxed text-amber-100/80">
            {etape.enigme.instruction}
          </p>
          <CipherBlock
            type={etape.enigme.type}
            display={etape.enigme.cipher_display}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowHint((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-300/10"
            >
              <Lightbulb size={13} /> {showHint ? 'Masquer' : 'Indice'}
            </button>
            <button
              onClick={() => setShowAnswer((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition"
              style={{ borderColor: theme.primary, color: theme.secondary }}
            >
              <Eye size={13} /> {showAnswer ? 'Masquer' : 'Réponse'}
            </button>
          </div>
          <Reveal open={showHint}>
            <p className="mt-3 rounded-lg border-l-2 border-amber-300/60 bg-amber-300/5 p-3 text-sm text-amber-100/80">
              {etape.enigme.hint}
            </p>
          </Reveal>
          <Reveal open={showAnswer}>
            <div className="mt-3 rounded-lg border-l-2 bg-black/40 p-3 text-sm"
                 style={{ borderColor: theme.primary }}>
              <p className="font-semibold" style={{ color: theme.secondary }}>
                {etape.enigme.answer}
              </p>
              <p className="mt-1 italic text-amber-100/65">
                {etape.enigme.answer_explanation}
              </p>
            </div>
          </Reveal>
        </section>

        <ScoreButton
          done={enigmeSolved}
          onClick={onToggleEnigme}
          label="Énigme résolue sans indice"
          color={theme.primary}
        />

        {/* Bonus médical */}
        {etape.medical_bonus && (
          <>
            <section className="rounded-lg border border-teal-400/40 bg-teal-400/5 p-4">
              <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-teal-300">
                <Stethoscope size={13} /> Bonus médecine
              </p>
              <span className="mb-2 inline-block rounded-full bg-teal-500 px-2.5 py-0.5 text-[9px] uppercase tracking-wider text-white">
                {etape.medical_bonus.specialty}
              </span>
              <p className="text-sm leading-relaxed text-amber-100/80">
                {etape.medical_bonus.question}
              </p>
              <button
                onClick={() => setShowMedical((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 px-3 py-1.5 text-xs text-teal-300 transition hover:bg-teal-400/10"
              >
                <Eye size={13} /> {showMedical ? 'Masquer' : 'Voir la réponse'}
              </button>
              <Reveal open={showMedical}>
                <div className="mt-3 space-y-2 rounded-lg border-l-2 border-teal-400/60 bg-teal-400/5 p-3 text-sm text-teal-100/85">
                  {etape.medical_bonus.hint && (
                    <p className="text-xs italic text-teal-200/60">
                      Indice : {etape.medical_bonus.hint}
                    </p>
                  )}
                  <p className="whitespace-pre-line">
                    {etape.medical_bonus.answer}
                  </p>
                </div>
              </Reveal>
            </section>
            <ScoreButton
              done={medicalCorrect}
              onClick={onToggleMedical}
              label="Question médicale réussie"
              color="#14b8a6"
            />
          </>
        )}

        {/* Mission */}
        {etape.action_mission && (
          <>
            <div
              className="rounded-lg border border-dashed p-3 text-sm text-amber-100/75"
              style={{ borderColor: theme.accent }}
            >
              <p
                className="mb-1 text-[9px] uppercase tracking-[0.25em]"
                style={{ color: theme.accent }}
              >
                ✦ Mission
              </p>
              {etape.action_mission}
            </div>
            <ScoreButton
              done={missionDone}
              onClick={onToggleMission}
              label="Mission accomplie"
              color={theme.accent}
            />
          </>
        )}
      </div>
    </article>
  )
}

function ScoreButton({
  done,
  onClick,
  label,
  color,
}: {
  done: boolean
  onClick: () => void
  label: string
  color: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm transition"
      style={{
        borderColor: done ? color : 'rgba(243,231,211,0.15)',
        backgroundColor: done ? color : 'transparent',
        color: done ? '#fff' : 'rgba(243,231,211,0.6)',
      }}
    >
      <span>{label}</span>
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full border"
        style={{ borderColor: done ? '#fff' : 'rgba(243,231,211,0.3)' }}
      >
        {done && <Check size={13} />}
      </span>
    </button>
  )
}
