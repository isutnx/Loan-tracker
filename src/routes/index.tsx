import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'

export const Route = createFileRoute('/')({
  component: App,
})

// ─── Types ───────────────────────────────────────────────────────────────────

interface Payment {
  id: string
  amount: number
  date: string
  type: 'installment' | 'custom'
}

interface Person {
  id: string
  name: string
  totalDebt: number
  monthlyInstallment: number
  notes: string
  payments: Payment[]
  completed: boolean
  completedDate?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function formatAmount(n: number) {
  return n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function calcPaidAmount(person: Person) {
  return person.payments.reduce((s, p) => s + p.amount, 0)
}

function calcRemaining(person: Person) {
  return Math.max(0, person.totalDebt - calcPaidAmount(person))
}

function calcProgressPct(person: Person) {
  if (person.totalDebt <= 0) return 0
  return Math.min(100, (calcPaidAmount(person) / person.totalDebt) * 100)
}

function calcMonthsRemaining(person: Person) {
  const rem = calcRemaining(person)
  if (rem <= 0 || person.monthlyInstallment <= 0) return 0
  return Math.ceil(rem / person.monthlyInstallment)
}

function calcExpectedDate(person: Person) {
  const months = calcMonthsRemaining(person)
  if (months === 0) return null
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' })
}

function formatMonthsArabic(months: number) {
  if (months === 0) return 'لا يوجد'
  if (months === 1) return 'شهر واحد'
  if (months === 2) return 'شهران'
  if (months <= 10) return `${months} أشهر`
  return `${months} شهراً`
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sajal-alduyun-v1'

function loadData(): Person[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Person[]
  } catch {
    return []
  }
}

function saveData(persons: Person[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persons))
  } catch {
    // ignore
  }
}

// ─── Add Person Modal ─────────────────────────────────────────────────────────

interface AddPersonModalProps {
  onClose: () => void
  onAdd: (p: Omit<Person, 'id' | 'payments' | 'completed'>) => void
}

function AddPersonModal({ onClose, onAdd }: AddPersonModalProps) {
  const [name, setName] = useState('')
  const [totalDebt, setTotalDebt] = useState('')
  const [monthlyInstallment, setMonthlyInstallment] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('الاسم مطلوب'); return }
    const debt = parseFloat(totalDebt)
    const inst = parseFloat(monthlyInstallment)
    if (!debt || debt <= 0) { setError('أدخل مبلغ الدين الصحيح'); return }
    if (!inst || inst <= 0) { setError('أدخل مبلغ القسط الشهري'); return }
    setError('')
    onAdd({ name: name.trim(), totalDebt: debt, monthlyInstallment: inst, notes })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">➕ إضافة شخص جديد</h2>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">الاسم *</label>
            <input ref={nameRef} className="input" placeholder="اسم الشخص" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">إجمالي الدين *</label>
            <input className="input" type="number" placeholder="0.00" min="0" step="0.01" value={totalDebt} onChange={e => setTotalDebt(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">القسط الشهري *</label>
            <input className="input" type="number" placeholder="0.00" min="0" step="0.01" value={monthlyInstallment} onChange={e => setMonthlyInstallment(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">ملاحظات (اختياري)</label>
            <textarea className="notes-area" placeholder="أي ملاحظات إضافية..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn btn-primary">إضافة</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ──────────────────────────────────────────────────────

interface RecordPaymentModalProps {
  person: Person
  onClose: () => void
  onRecord: (amount: number, date: string, type: 'installment' | 'custom') => void
}

function RecordPaymentModal({ person, onClose, onRecord }: RecordPaymentModalProps) {
  const [payType, setPayType] = useState<'installment' | 'custom'>('installment')
  const [customAmount, setCustomAmount] = useState('')
  const [date, setDate] = useState(todayString())
  const [error, setError] = useState('')
  const remaining = calcRemaining(person)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = payType === 'installment' ? person.monthlyInstallment : parseFloat(customAmount)
    if (!amount || amount <= 0) { setError('أدخل مبلغاً صحيحاً'); return }
    if (amount > remaining + 0.001) { setError(`المبلغ أكبر من المتبقي (${formatAmount(remaining)})`); return }
    if (!date) { setError('اختر تاريخاً'); return }
    setError('')
    onRecord(amount, date, payType)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">💳 تسجيل دفعة</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
          المتبقي: <strong style={{ color: 'var(--danger)' }}>{formatAmount(remaining)}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>نوع الدفعة</label>
          <div className="radio-group">
            <div className={`radio-opt${payType === 'installment' ? ' selected' : ''}`} onClick={() => setPayType('installment')}>
              <div className="radio-dot" />
              <span>قسط شهري ({formatAmount(person.monthlyInstallment)})</span>
            </div>
            <div className={`radio-opt${payType === 'custom' ? ' selected' : ''}`} onClick={() => setPayType('custom')}>
              <div className="radio-dot" />
              <span>مبلغ مخصص</span>
            </div>
          </div>
          {payType === 'custom' && (
            <div className="input-group">
              <label className="input-label">المبلغ *</label>
              <input autoFocus className="input" type="number" placeholder="0.00" min="0" step="0.01" value={customAmount} onChange={e => setCustomAmount(e.target.value)} />
            </div>
          )}
          <div className="input-group">
            <label className="input-label">التاريخ</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ colorScheme: 'dark' }} />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn btn-primary">تسجيل الدفعة</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ title, message, confirmLabel = 'تأكيد', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-success'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Export/Import Modal ───────────────────────────────────────────────────────

interface DataModalProps {
  persons: Person[]
  onImport: (persons: Person[]) => void
  onClose: () => void
}

function DataModal({ persons, onImport, onClose }: DataModalProps) {
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [importText, setImportText] = useState('')
  const [copied, setCopied] = useState(false)
  const [importError, setImportError] = useState('')
  const exportText = JSON.stringify(persons, null, 2)

  function handleCopy() {
    navigator.clipboard.writeText(exportText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleImport() {
    try {
      const data = JSON.parse(importText)
      if (!Array.isArray(data)) throw new Error()
      onImport(data as Person[])
      onClose()
    } catch {
      setImportError('البيانات غير صالحة. تأكد من نسخ JSON الصحيح.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">📦 النسخ الاحتياطي</h2>
        <div className="radio-group" style={{ marginBottom: '16px' }}>
          <div className={`radio-opt${mode === 'export' ? ' selected' : ''}`} onClick={() => setMode('export')}>
            <div className="radio-dot" />
            تصدير البيانات
          </div>
          <div className={`radio-opt${mode === 'import' ? ' selected' : ''}`} onClick={() => setMode('import')}>
            <div className="radio-dot" />
            استيراد البيانات
          </div>
        </div>
        {mode === 'export' ? (
          <>
            <textarea
              readOnly
              className="notes-area"
              style={{ minHeight: '200px', fontSize: '0.75rem', fontFamily: 'monospace', direction: 'ltr' }}
              value={exportText}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
              <button className={`btn ${copied ? 'btn-success' : 'btn-primary'}`} onClick={handleCopy}>
                {copied ? '✓ تم النسخ!' : '📋 نسخ JSON'}
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              className="notes-area"
              style={{ minHeight: '200px', fontSize: '0.75rem', fontFamily: 'monospace', direction: 'ltr' }}
              placeholder='الصق بيانات JSON هنا...'
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportError('') }}
            />
            {importError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '8px' }}>{importError}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={!importText.trim()}>استيراد</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Person View ───────────────────────────────────────────────────────────────

interface PersonViewProps {
  person: Person
  onUpdate: (p: Person) => void
  onDelete: () => void
}

function PersonView({ person, onUpdate, onDelete }: PersonViewProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [showUndoConfirm, setShowUndoConfirm] = useState<string | null>(null)
  const [notes, setNotes] = useState(person.notes)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const paid = calcPaidAmount(person)
  const remaining = calcRemaining(person)
  const pct = calcProgressPct(person)
  const monthsLeft = calcMonthsRemaining(person)
  const expectedDate = calcExpectedDate(person)

  const justCompleted = !person.completed && remaining === 0 && person.payments.length > 0

  function handleAddPayment(amount: number, date: string, type: 'installment' | 'custom') {
    const payment: Payment = { id: genId(), amount, date, type }
    const updated: Person = { ...person, payments: [payment, ...person.payments] }
    onUpdate(updated)
    setShowPaymentModal(false)
  }

  function handleUndo(paymentId: string) {
    const updated: Person = { ...person, payments: person.payments.filter(p => p.id !== paymentId) }
    onUpdate(updated)
    setShowUndoConfirm(null)
  }

  function handleMarkComplete() {
    onUpdate({ ...person, completed: true, completedDate: todayString() })
    setShowCompleteConfirm(false)
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      onUpdate({ ...person, notes: val })
    }, 600)
  }

  const sortedPayments = [...person.payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (person.completed) {
    return (
      <div className="animate-fade-in">
        <div className="celebration-banner">
          <span className="celebration-emoji">🏆</span>
          <div className="celebration-title">سدّد الدين كاملاً!</div>
          <div className="celebration-sub">
            أتمّ {person.name} سداد كامل مبلغ {formatAmount(person.totalDebt)}
            {person.completedDate && ` بتاريخ ${formatDate(person.completedDate)}`}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="stats-grid">
            <div className="stat-card paid">
              <div className="stat-value">{formatAmount(person.totalDebt)}</div>
              <div className="stat-label">إجمالي ما سُدِّد</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--gold)' }}>{person.payments.length}</div>
              <div className="stat-label">عدد الدفعات</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">سجل الدفعات</div>
          {sortedPayments.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '12px 0' }}>لا توجد دفعات مسجلة</div>
          )}
          {sortedPayments.map(p => (
            <div key={p.id} className="payment-row">
              <div>
                <div className={`payment-amount ${p.type}`}>{formatAmount(p.amount)}</div>
                <div className="payment-meta">{formatDate(p.date)}</div>
              </div>
              <span className={`payment-type-badge badge-${p.type}`}>
                {p.type === 'installment' ? 'قسط شهري' : 'مبلغ مخصص'}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>🗑 حذف السجل</button>
        </div>

        {showDeleteConfirm && (
          <ConfirmDialog
            title="🗑 حذف السجل"
            message={`هل أنت متأكد من حذف سجل "${person.name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`}
            confirmLabel="حذف"
            danger
            onConfirm={onDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Completion prompt */}
      {justCompleted && (
        <div className="celebration-banner">
          <span className="celebration-emoji">🎉</span>
          <div className="celebration-title">اكتمل السداد!</div>
          <div className="celebration-sub" style={{ marginBottom: '16px' }}>وصل الرصيد المتبقي إلى صفر. هل تريد تأكيد الإغلاق؟</div>
          <button className="btn btn-lg" style={{ background: 'var(--gold)', color: '#000' }} onClick={() => setShowCompleteConfirm(true)}>
            🏆 تأكيد إتمام السداد
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card remaining">
          <div className="stat-value">{formatAmount(remaining)}</div>
          <div className="stat-label">المتبقي</div>
        </div>
        <div className="stat-card paid">
          <div className="stat-value">{formatAmount(paid)}</div>
          <div className="stat-label">المدفوع</div>
        </div>
        <div className="stat-card installment">
          <div className="stat-value">{formatAmount(person.monthlyInstallment)}</div>
          <div className="stat-label">القسط الشهري</div>
        </div>
        <div className="stat-card total">
          <div className="stat-value">{formatAmount(person.totalDebt)}</div>
          <div className="stat-label">إجمالي الدين</div>
        </div>
      </div>

      {/* Progress */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="progress-container">
          <div className="progress-header">
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>نسبة السداد</span>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{pct.toFixed(1)}%</span>
          </div>
          <div className="progress-track">
            <div className={`progress-fill${pct >= 100 ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {remaining > 0 && (
          <div className="time-info">
            <div className="time-info-item">
              ⏱ الوقت المتبقي: <span>{formatMonthsArabic(monthsLeft)}</span>
            </div>
            {expectedDate && (
              <div className="time-info-item">
                📅 تاريخ الانتهاء المتوقع: <span>{expectedDate}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Record Payment */}
      <div style={{ marginBottom: '16px' }}>
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          onClick={() => setShowPaymentModal(true)}
          disabled={remaining <= 0}
        >
          💳 تسجيل دفعة
        </button>
      </div>

      {/* Notes */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">📝 ملاحظات</div>
        <textarea
          className="notes-area"
          placeholder="أضف ملاحظات هنا..."
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          rows={3}
        />
      </div>

      {/* Payment History */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">📋 سجل الدفعات ({person.payments.length})</div>
        {sortedPayments.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '12px 0', textAlign: 'center' }}>
            لم يتم تسجيل أي دفعات بعد
          </div>
        )}
        {sortedPayments.map(p => (
          <div key={p.id} className="payment-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div>
                <div className={`payment-amount ${p.type}`}>{formatAmount(p.amount)}</div>
                <div className="payment-meta">{formatDate(p.date)}</div>
              </div>
              <span className={`payment-type-badge badge-${p.type}`}>
                {p.type === 'installment' ? 'قسط شهري' : 'مبلغ مخصص'}
              </span>
            </div>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              title="تراجع"
              onClick={() => setShowUndoConfirm(p.id)}
              style={{ color: 'var(--danger)', flexShrink: 0 }}
            >
              ↩
            </button>
          </div>
        ))}
      </div>

      {/* Delete */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>🗑 حذف الشخص</button>
      </div>

      {/* Modals */}
      {showPaymentModal && (
        <RecordPaymentModal person={person} onClose={() => setShowPaymentModal(false)} onRecord={handleAddPayment} />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="🗑 حذف الشخص"
          message={`هل أنت متأكد من حذف "${person.name}" وجميع سجلاته؟ لا يمكن التراجع.`}
          confirmLabel="حذف"
          danger
          onConfirm={onDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showCompleteConfirm && (
        <ConfirmDialog
          title="🏆 تأكيد إتمام السداد"
          message={`هل تريد تأكيد أن "${person.name}" قد سدّد الدين كاملاً؟ سيتم نقله إلى قسم المكتملين.`}
          confirmLabel="✓ تأكيد"
          onConfirm={handleMarkComplete}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
      {showUndoConfirm && (
        <ConfirmDialog
          title="↩ التراجع عن الدفعة"
          message="هل تريد حذف هذه الدفعة وإعادة المبلغ للرصيد المتبقي؟"
          confirmLabel="تراجع عن الدفعة"
          danger
          onConfirm={() => handleUndo(showUndoConfirm)}
          onCancel={() => setShowUndoConfirm(null)}
        />
      )}
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const [persons, setPersons] = useState<Person[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDataModal, setShowDataModal] = useState(false)

  // Load from localStorage once
  useEffect(() => {
    const data = loadData()
    setPersons(data)
    if (data.length > 0) setActiveId(data[0].id)
  }, [])

  // Persist on change
  useEffect(() => {
    if (persons.length > 0 || localStorage.getItem(STORAGE_KEY)) {
      saveData(persons)
    }
  }, [persons])

  const updatePerson = useCallback((updated: Person) => {
    setPersons(prev => prev.map(p => p.id === updated.id ? updated : p))
  }, [])

  const deletePerson = useCallback((id: string) => {
    setPersons(prev => {
      const next = prev.filter(p => p.id !== id)
      setActiveId(next.length > 0 ? next[0].id : null)
      return next
    })
  }, [])

  function handleAddPerson(data: Omit<Person, 'id' | 'payments' | 'completed'>) {
    const newPerson: Person = { ...data, id: genId(), payments: [], completed: false }
    setPersons(prev => [...prev, newPerson])
    setActiveId(newPerson.id)
    setShowAddModal(false)
  }

  function handleImport(data: Person[]) {
    setPersons(data)
    setActiveId(data.length > 0 ? data[0].id : null)
  }

  const activePersons = persons.filter(p => !p.completed)
  const completedPersons = persons.filter(p => p.completed)
  const activePerson = persons.find(p => p.id === activeId) ?? null

  return (
    <div className="app-container">
      {/* Header */}
      <div className="app-header">
        <h1 className="app-title">سجل الديون</h1>
        <p className="app-subtitle">تتبع الديون والأقساط بسهولة</p>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setShowDataModal(true)}>
          📦 النسخ الاحتياطي
        </button>
      </div>

      {/* Tabs */}
      {persons.length > 0 && (
        <div className="tabs-container">
          {activePersons.map(p => (
            <button
              key={p.id}
              className={`tab-btn${activeId === p.id ? ' active' : ''}`}
              onClick={() => setActiveId(p.id)}
            >
              {p.name}
              {calcRemaining(p) === 0 && p.payments.length > 0 && (
                <span style={{ fontSize: '0.7rem' }}>✓</span>
              )}
            </button>
          ))}

          {completedPersons.length > 0 && activePersons.length > 0 && (
            <div className="tab-divider" />
          )}

          {completedPersons.map(p => (
            <button
              key={p.id}
              className={`tab-btn completed${activeId === p.id ? ' active' : ''}`}
              onClick={() => setActiveId(p.id)}
            >
              🏆 {p.name}
            </button>
          ))}

          <button className="tab-add" onClick={() => setShowAddModal(true)}>
            ＋ إضافة
          </button>
        </div>
      )}

      {/* Content */}
      {persons.length === 0 ? (
        <div className="card-elevated">
          <div className="empty-state">
            <span className="empty-icon">📒</span>
            <div className="empty-title">لا توجد سجلات بعد</div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem', lineHeight: 1.6 }}>
              أضف شخصاً لبدء تتبع ديونه وأقساطه
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setShowAddModal(true)}>
              ➕ إضافة أول شخص
            </button>
          </div>
        </div>
      ) : activePerson ? (
        <PersonView
          key={activePerson.id}
          person={activePerson}
          onUpdate={updatePerson}
          onDelete={() => deletePerson(activePerson.id)}
        />
      ) : null}

      {/* Modals */}
      {showAddModal && (
        <AddPersonModal onClose={() => setShowAddModal(false)} onAdd={handleAddPerson} />
      )}
      {showDataModal && (
        <DataModal persons={persons} onImport={handleImport} onClose={() => setShowDataModal(false)} />
      )}
    </div>
  )
}
