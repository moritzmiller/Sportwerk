"use client";

import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  Database,
  Download,
  FileText,
  Heading2,
  Layers3,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'

const STORAGE_KEYS = {
  customers: 'angebotsstudio.customers',
  offers: 'angebotsstudio.offers',
}

const OFFER_STUDIO_API = '/api/offers/studio'

const emptyCustomer = {
  name: '',
  contact: '',
  email: '',
  phone: '',
  address: '',
}

const defaultCompany = {
  name: 'Mein Unternehmen',
  contact: 'Moritz',
  representedBy: 'Moritz',
  logo: '',
  email: 'kontakt@example.com',
  phone: '+49 000 000000',
  address: 'Musterstraße 1, 12345 Musterstadt',
  taxId: 'USt-IdNr. DE000000000',
  bankName: 'Musterbank',
  bic: 'ABCDEFGHXXX',
  accountHolder: 'Mein Unternehmen',
  iban: 'DE00 0000 0000 0000 0000 00',
}

const defaultLegal = {
  paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
  validity: 'Dieses Angebot ist bis zum angegebenen Datum gültig.',
  jurisdiction: 'Es gelten die vereinbarten Vertragsbedingungen und deutsches Recht.',
  footerLine: 'Bankverbindung, Steuernummer und weitere Pflichtangaben gemäß Impressum.',
  closingText: [
    'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
    'Dieses Angebot ist bis zum angegebenen Datum gültig.',
    'Es gelten die vereinbarten Vertragsbedingungen und deutsches Recht.',
    'Bankverbindung, Steuernummer und weitere Pflichtangaben gemäß Impressum.',
  ].join('\n'),
}

const emptyItem = {
  type: 'detail',
  title: '',
  description: '',
  quantity: 1,
  unit: 'Stk.',
  unitPrice: 0,
  taxRate: 19,
}

const starterItems = [
  {
    type: 'heading',
    title: 'Projektleistungen',
  },
  {
    type: 'flat',
    title: 'Projektkonzeption',
    description: 'Analyse, Strukturierung und Erstellung des Umsetzungskonzepts.',
    quantity: 1,
    unit: 'Pauschale',
    unitPrice: 850,
    taxRate: 19,
  },
  {
    type: 'detail',
    title: 'Umsetzungspaket',
    description: 'Design, technische Umsetzung, Abstimmung und erste Korrekturschleife.',
    quantity: 12,
    unit: 'Std.',
    unitPrice: 95,
    taxRate: 19,
  },
]

const servicePresets = [
  { type: 'flat', title: 'Strategie Workshop', unit: 'Pauschale', unitPrice: 1200, description: 'Halbtägiger Workshop inklusive Dokumentation.' },
  { title: 'Design & Layout', unit: 'Std.', unitPrice: 90, description: 'Visuelle Ausarbeitung, Komponenten und Abstimmung.' },
  { title: 'Technische Umsetzung', unit: 'Std.', unitPrice: 110, description: 'Entwicklung, Integration und Qualitätssicherung.' },
  { title: 'Projektmanagement', unit: 'Std.', unitPrice: 85, description: 'Koordination, Statusupdates und Terminabstimmung.' },
]

const itemTypes = {
  heading: {
    label: 'Überschrift',
    icon: Heading2,
    defaults: { type: 'heading', title: 'Neue Überschrift' },
  },
  separator: {
    label: 'Trennlinie',
    icon: Minus,
    defaults: { type: 'separator', title: '', description: '' },
  },
  flat: {
    label: 'Pauschalposten',
    icon: Layers3,
    defaults: { ...emptyItem, type: 'flat', unit: 'Pauschale', quantity: 1, title: 'Neue Pauschale' },
  },
  detail: {
    label: 'Detailposten',
    icon: FileText,
    defaults: { ...emptyItem, type: 'detail', unit: 'Std.', title: 'Neue Leistung' },
  },
}

const formatMoney = (value) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(value) ? value : 0)

const formatDate = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(value))
}

const lineNet = (item) => {
  if (!isPricedItem(item)) return 0
  if (item.type === 'flat') return Number(item.unitPrice || 0)
  return Number(item.quantity || 0) * Number(item.unitPrice || 0)
}

const isPricedItem = (item) => item.type === 'detail' || item.type === 'flat'

const adjustmentValue = (net, adjustment) => {
  const percentage = Number(adjustment?.value || 0)
  const value = net * (percentage / 100)
  return adjustment?.type === 'surcharge' ? value : -value
}

const quantityUnitLabel = (item) => {
  if (!isPricedItem(item)) return ''
  if (item.type === 'flat') return 'Pauschal'
  return `${item.quantity} ${item.unit}`
}

const createId = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

const normalizeItem = (item) => {
  if (item.type === 'heading' || item.type === 'separator') {
    return { ...item, description: undefined, id: item.id || createId() }
  }
  const rest = { ...item }
  for (const key of ['discount', `hide${'Quantity'}`, `hide${'Unit'}`, `hide${'Price'}`]) {
    delete rest[key]
  }
  if (rest.type === 'flat') {
    rest.quantity = 1
    rest.unit = 'Pauschal'
  }
  return {
    ...rest,
    id: item.id || createId(),
  }
}

const cloneItems = (items) => items.map(normalizeItem)

const cloneStarterItems = () => cloneItems(starterItems)

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function loadRecords(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveRecords(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Die Daten konnten nicht gespeichert werden.')
    error.status = response.status
    throw error
  }
  return data
}

function offerSequence(number) {
  const match = /^ANG-(\d{4})-(\d{3,})$/.exec(number || '')
  return match ? Number(match[2]) : 0
}

function nextOfferNumber(savedOffers) {
  const year = new Date().getFullYear()
  const maxSequence = savedOffers
    .filter((savedOffer) => savedOffer.number?.startsWith(`ANG-${year}-`))
    .reduce((max, savedOffer) => Math.max(max, offerSequence(savedOffer.number)), 0)
  return `ANG-${year}-${String(maxSequence + 1).padStart(3, '0')}`
}

function createBlankOffer(number) {
  return {
    id: null,
    number,
    date: today(),
    validUntil: addDays(14),
    title: 'Angebot',
    intro: 'Vielen Dank für die Anfrage. Auf Basis der besprochenen Anforderungen biete ich folgende Leistungen an.',
    note: 'Die Umsetzung startet nach schriftlicher Beauftragung. Änderungen am Leistungsumfang werden separat angeboten.',
    adjustment: {
      type: 'discount',
      value: 0,
    },
    showItemDetails: true,
    company: { ...defaultCompany },
    customer: {
      name: 'Kundenunternehmen GmbH',
      contact: 'Max Mustermann',
      email: 'max@example.com',
      phone: '',
      address: 'Kundenstraße 5, 54321 Kundenstadt',
    },
    legal: { ...defaultLegal },
  }
}

function normalizeLegal(legal = {}) {
  const mergedLegal = { ...defaultLegal, ...legal }
  const closingText = mergedLegal.closingText || [
    mergedLegal.paymentTerms,
    mergedLegal.validity,
    mergedLegal.jurisdiction,
    mergedLegal.footerLine,
  ].filter(Boolean).join('\n')
  return { ...mergedLegal, closingText }
}

function normalizeOffer(offer) {
  return {
    adjustment: { type: 'discount', value: 0 },
    showItemDetails: true,
    ...offer,
    company: { ...defaultCompany, ...(offer.company || {}) },
    legal: normalizeLegal(offer.legal),
  }
}

function customerMatchesOffer(customer, offerCustomer) {
  return customer.name === offerCustomer.name
    && customer.contact === offerCustomer.contact
    && customer.email === offerCustomer.email
    && customer.address === offerCustomer.address
}

function useAutoResizeTextarea(ref, value) {
  useEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [ref, value])
}

export default function App() {
  const previewRef = useRef(null)
  const [activeView, setActiveView] = useState('editor')
  const [isExporting, setIsExporting] = useState(false)
  const [isItemOverlayOpen, setIsItemOverlayOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draftItem, setDraftItem] = useState(emptyItem)
  const [customers, setCustomers] = useState(() => loadRecords(STORAGE_KEYS.customers, []))
  const [savedOffers, setSavedOffers] = useState(() => loadRecords(STORAGE_KEYS.offers, []).map(normalizeOffer))
  const [customerDraft, setCustomerDraft] = useState(emptyCustomer)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [offerSearch, setOfferSearch] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [editingOfferId, setEditingOfferId] = useState(null)
  const [offer, setOffer] = useState(() => createBlankOffer(nextOfferNumber(loadRecords(STORAGE_KEYS.offers, []))))
  const [items, setItems] = useState(cloneStarterItems)
  const [isRemoteStorage, setIsRemoteStorage] = useState(false)
  const [isLoadingRemoteStorage, setIsLoadingRemoteStorage] = useState(true)

  useEffect(() => saveRecords(STORAGE_KEYS.customers, customers), [customers])
  useEffect(() => saveRecords(STORAGE_KEYS.offers, savedOffers), [savedOffers])

  useEffect(() => {
    let isCurrent = true

    async function loadRemoteData() {
      try {
        const data = await requestJson(OFFER_STUDIO_API)
        if (!isCurrent) return
        const remoteOffers = (data.offers || []).map(normalizeOffer)
        setCustomers(data.customers || [])
        setSavedOffers(remoteOffers)
        setOffer((current) => ({
          ...current,
          number: nextOfferNumber(remoteOffers),
          company: data.companyProfile ? { ...current.company, ...data.companyProfile } : current.company,
        }))
        setIsRemoteStorage(true)
      } catch (error) {
        if (!isCurrent) return
        setIsRemoteStorage(false)
        if (error.status && error.status !== 401 && error.status !== 403) {
          setStatusMessage(`Supabase-Speicherung nicht erreichbar: ${error.message}`)
        }
      } finally {
        if (isCurrent) setIsLoadingRemoteStorage(false)
      }
    }

    loadRemoteData()

    return () => {
      isCurrent = false
    }
  }, [])

  const totals = useMemo(() => {
    const net = items.reduce((sum, item) => sum + lineNet(item), 0)
    const adjustment = adjustmentValue(net, offer.adjustment)
    const adjustedNet = Math.max(0, net + adjustment)
    const averageTaxRate = net > 0
      ? items.reduce((sum, item) => sum + lineNet(item) * (Number(item.taxRate || 0) / 100), 0) / net
      : 0
    const tax = adjustedNet * averageTaxRate
    return { net, adjustment, adjustedNet, tax, gross: adjustedNet + tax }
  }, [items, offer.adjustment])

  const filteredOffers = useMemo(() => {
    const query = offerSearch.trim().toLowerCase()
    if (!query) return savedOffers
    return savedOffers.filter((savedOffer) =>
      [savedOffer.number, savedOffer.title, savedOffer.customer?.name, savedOffer.customer?.contact]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    )
  }, [offerSearch, savedOffers])

  function updateOffer(path, value) {
    const [group, key] = path.split('.')
    if (!key) {
      setOffer((current) => ({ ...current, [group]: value }))
      return
    }
    setOffer((current) => ({
      ...current,
      [group]: { ...(current[group] || {}), [key]: value },
    }))
  }

  function uploadCompanyLogo(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Bitte eine Bilddatei für das Logo auswählen.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      updateOffer('company.logo', reader.result || '')
      setStatusMessage('Logo wurde übernommen.')
    }
    reader.onerror = () => setStatusMessage('Logo konnte nicht gelesen werden.')
    reader.readAsDataURL(file)
  }

  function updateCustomerDraft(field, value) {
    setCustomerDraft((current) => ({ ...current, [field]: value }))
  }

  function applyCustomer(customer) {
    setOffer((current) => ({ ...current, customer: { ...emptyCustomer, ...customer } }))
    setSelectedCustomerId(customer.id)
    setActiveView('editor')
    setStatusMessage(`${customer.name || 'Kunde'} wurde ins Angebot übernommen.`)
  }

  async function saveCustomerFromOffer() {
    const customer = { ...emptyCustomer, ...offer.customer }
    if (!customer.name.trim()) {
      setStatusMessage('Bitte zuerst einen Kundennamen eintragen.')
      return
    }

    if (isRemoteStorage) {
      try {
        const data = await requestJson(`${OFFER_STUDIO_API}/customers`, {
          method: 'POST',
          body: JSON.stringify({ customer }),
        })
        setCustomers((current) => {
          const withoutDuplicate = current.filter((entry) => entry.id !== data.customer.id)
          return [...withoutDuplicate, data.customer].sort((a, b) => a.name.localeCompare(b.name, 'de'))
        })
        setStatusMessage(`${data.customer.name} wurde in Supabase gespeichert.`)
        return
      } catch (error) {
        setStatusMessage(`Kunde konnte nicht in Supabase gespeichert werden: ${error.message}`)
      }
    }

    setCustomers((current) => {
      const existing = current.find((entry) => customerMatchesOffer(entry, customer))
      if (existing) return current
      return [...current, { ...customer, id: createId(), createdAt: new Date().toISOString() }]
    })
    setStatusMessage(`${customer.name} wurde in der Kundendatenbank gespeichert.`)
  }

  async function saveCustomerDraft() {
    if (!customerDraft.name.trim()) {
      setStatusMessage('Bitte einen Kundennamen für den Stammkunden eintragen.')
      return
    }
    if (isRemoteStorage) {
      try {
        const data = await requestJson(`${OFFER_STUDIO_API}/customers`, {
          method: 'POST',
          body: JSON.stringify({ customer: customerDraft }),
        })
        setCustomers((current) => [...current, data.customer].sort((a, b) => a.name.localeCompare(b.name, 'de')))
        setCustomerDraft(emptyCustomer)
        setStatusMessage(`${data.customer.name} wurde als Stammkunde in Supabase gespeichert.`)
        return
      } catch (error) {
        setStatusMessage(`Stammkunde konnte nicht in Supabase gespeichert werden: ${error.message}`)
      }
    }

    const customer = {
      ...customerDraft,
      id: createId(),
      createdAt: new Date().toISOString(),
    }
    setCustomers((current) => [...current, customer])
    setCustomerDraft(emptyCustomer)
    setStatusMessage(`${customer.name} wurde als Stammkunde gespeichert.`)
  }

  async function deleteCustomer(id) {
    if (isRemoteStorage) {
      try {
        await requestJson(`${OFFER_STUDIO_API}/customers/${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch (error) {
        setStatusMessage(`Kunde konnte nicht in Supabase gelöscht werden: ${error.message}`)
        return
      }
    }
    setCustomers((current) => current.filter((customer) => customer.id !== id))
    if (selectedCustomerId === id) setSelectedCustomerId('')
  }

  function newOffer() {
    setOffer(createBlankOffer(nextOfferNumber(savedOffers)))
    setItems(cloneStarterItems())
    setEditingOfferId(null)
    setSelectedCustomerId('')
    setActiveView('editor')
    setStatusMessage('Neues Angebot mit fortlaufender Nummer vorbereitet.')
  }

  async function saveCurrentOffer() {
    const now = new Date().toISOString()
    const existingOffer = editingOfferId ? savedOffers.find((savedOffer) => savedOffer.id === editingOfferId) : null
    const record = {
      ...offer,
      id: editingOfferId || createId(),
      createdAt: existingOffer?.createdAt || now,
      updatedAt: now,
      items: cloneItems(items),
      totals,
    }

    if (isRemoteStorage) {
      try {
        const data = await requestJson(`${OFFER_STUDIO_API}/offers`, {
          method: 'POST',
          body: JSON.stringify({
            offer: { ...offer, id: editingOfferId },
            items: cloneItems(items),
            totals,
          }),
        })
        const remoteOffer = normalizeOffer(data.offer)
        setSavedOffers((current) => {
          const withoutCurrent = current.filter((savedOffer) => savedOffer.id !== remoteOffer.id)
          return [remoteOffer, ...withoutCurrent].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        })
        setOffer(remoteOffer)
        setItems(cloneItems(remoteOffer.items || []))
        setEditingOfferId(remoteOffer.id)
        setStatusMessage(`${remoteOffer.number} wurde in Supabase gespeichert.`)
        return
      } catch (error) {
        setStatusMessage(`Angebot konnte nicht in Supabase gespeichert werden: ${error.message}`)
      }
    }

    setSavedOffers((current) => {
      const withoutCurrent = editingOfferId ? current.filter((savedOffer) => savedOffer.id !== editingOfferId) : current
      return [record, ...withoutCurrent].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    })
    setOffer(record)
    setEditingOfferId(record.id)
    setStatusMessage(`${record.number} wurde gespeichert.`)
  }

  function openSavedOffer(savedOffer) {
    const normalizedOffer = normalizeOffer(savedOffer)
    setOffer(normalizedOffer)
    setItems(cloneItems(savedOffer.items || []))
    setEditingOfferId(savedOffer.id)
    setSelectedCustomerId('')
    setActiveView('editor')
    setStatusMessage(`${savedOffer.number} wurde geöffnet.`)
  }

  async function deleteSavedOffer(id) {
    if (isRemoteStorage) {
      try {
        await requestJson(`${OFFER_STUDIO_API}/offers/${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch (error) {
        setStatusMessage(`Angebot konnte nicht in Supabase gelöscht werden: ${error.message}`)
        return
      }
    }
    const remainingOffers = savedOffers.filter((savedOffer) => savedOffer.id !== id)
    setSavedOffers(remainingOffers)
    if (editingOfferId === id) {
      setOffer(createBlankOffer(nextOfferNumber(remainingOffers)))
      setItems(cloneStarterItems())
      setEditingOfferId(null)
      setSelectedCustomerId('')
      setStatusMessage('Das geöffnete Angebot wurde gelöscht. Ein neues Angebot ist vorbereitet.')
    }
  }

  function openNewItem(preset) {
    setEditingId(null)
    setDraftItem({ ...emptyItem, ...(preset || {}), type: preset?.type || 'detail' })
    setIsItemOverlayOpen(true)
  }

  function openEditItem(item) {
    setEditingId(item.id)
    setDraftItem({ ...item })
    setIsItemOverlayOpen(true)
  }

  function saveItem() {
    const normalized = {
      ...draftItem,
      type: draftItem.type || 'detail',
      title: draftItem.title.trim() || 'Neue Leistung',
      quantity: Number(draftItem.quantity) || 0,
      unitPrice: Number(draftItem.unitPrice) || 0,
      taxRate: Number(draftItem.taxRate) || 0,
    }
    if (normalized.type === 'heading') delete normalized.description
    if (normalized.type === 'flat') {
      normalized.quantity = 1
      normalized.unit = 'Pauschal'
    }

    if (editingId) {
      setItems((current) => current.map((item) => (item.id === editingId ? { ...normalized, id: editingId } : item)))
    } else {
      setItems((current) => [...current, { ...normalized, id: createId() }])
    }
    setIsItemOverlayOpen(false)
  }

  function deleteItem(id) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  function addItem(type) {
    const blueprint = itemTypes[type]?.defaults || itemTypes.detail.defaults
    setItems((current) => [...current, { ...blueprint, id: createId() }])
  }

  function updateItem(id, patch) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function moveItem(id, direction) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }

  async function exportPdf() {
    if (!previewRef.current) return
    setIsExporting(true)
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(`${offer.number || 'angebot'}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="offer-studio app-shell">
      <nav className="app-nav" aria-label="Hauptnavigation">
        <div className="nav-tabs" role="tablist" aria-label="Ansichten">
          <button className={activeView === 'editor' ? 'is-active' : ''} type="button" onClick={() => setActiveView('editor')}>
            <FileText size={17} /> Angebot
          </button>
          <button className={activeView === 'details' ? 'is-active' : ''} type="button" onClick={() => setActiveView('details')}>
            <Building2 size={17} /> Unternehmen
          </button>
          <button className={activeView === 'customers' ? 'is-active' : ''} type="button" onClick={() => setActiveView('customers')}>
            <UsersRound size={17} /> Kunden
          </button>
          <button className={activeView === 'offers' ? 'is-active' : ''} type="button" onClick={() => setActiveView('offers')}>
            <ListChecks size={17} /> Übersicht
          </button>
        </div>
        <div className="nav-actions">
          <span className="storage-status">
            {isLoadingRemoteStorage ? 'Speicher wird geprüft' : isRemoteStorage ? 'Supabase aktiv' : 'Lokal'}
          </span>
          <button className="secondary-button" type="button" onClick={newOffer}>
            <RotateCcw size={17} /> Neu
          </button>
          <button className="primary-button" type="button" onClick={saveCurrentOffer}>
            <Save size={18} /> Angebot speichern
          </button>
        </div>
      </nav>

      {statusMessage && (
        <div className="status-line" role="status">
          {statusMessage}
        </div>
      )}

      {activeView === 'editor' && (
        <section className="workspace">
          <aside className="editor-panel" aria-label="Angebotsdaten">
            <div className="toolbar">
              <button className="primary-button" type="button" onClick={() => openNewItem()}>
                <Plus size={18} /> Leistung
              </button>
              <button className="icon-button" type="button" onClick={exportPdf} title="PDF exportieren" aria-label="PDF exportieren" disabled={isExporting}>
                <Download size={19} />
              </button>
            </div>

            <Fieldset title="Kunde aus Datenbank" icon={<Database size={17} />}>
              <Select label="Stammkunde auswählen" value={selectedCustomerId} onChange={(value) => {
                setSelectedCustomerId(value)
                const customer = customers.find((entry) => entry.id === value)
                if (customer) applyCustomer(customer)
              }}>
                <option value="">Kein Stammkunde ausgewählt</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </Select>
              <button className="secondary-button full-width" type="button" onClick={saveCustomerFromOffer}>
                <UserPlus size={17} /> Aktuellen Kunden speichern
              </button>
            </Fieldset>

            <Fieldset title="Element hinzufügen" icon={<Plus size={17} />}>
              <div className="type-actions" aria-label="Angebotselemente hinzufügen">
                {Object.entries(itemTypes).map(([type, config]) => {
                  const Icon = config.icon
                  return (
                    <button key={type} type="button" onClick={() => addItem(type)}>
                      <Icon size={16} /> {config.label}
                    </button>
                  )
                })}
              </div>
            </Fieldset>

            <Fieldset title="Angebot" icon={<CalendarDays size={17} />}>
              <Input label="Titel" value={offer.title} onChange={(value) => updateOffer('title', value)} />
              <div className="field-grid">
                <Input label="Nummer" value={offer.number} onChange={(value) => updateOffer('number', value)} />
                <Input label="Datum" type="date" value={offer.date} onChange={(value) => updateOffer('date', value)} />
                <Input label="Gültig bis" type="date" value={offer.validUntil} onChange={(value) => updateOffer('validUntil', value)} />
              </div>
            </Fieldset>

            <Fieldset title="Kunde" icon={<UserRound size={17} />}>
              <Input label="Unternehmen" value={offer.customer.name} onChange={(value) => updateOffer('customer.name', value)} />
              <Input label="Ansprechpartner" value={offer.customer.contact} onChange={(value) => updateOffer('customer.contact', value)} />
              <Input label="E-Mail" value={offer.customer.email} onChange={(value) => updateOffer('customer.email', value)} />
              <Input label="Telefon" value={offer.customer.phone} onChange={(value) => updateOffer('customer.phone', value)} />
              <Textarea label="Adresse" value={offer.customer.address} onChange={(value) => updateOffer('customer.address', value)} />
            </Fieldset>

          </aside>

          <OfferPreview
            offer={offer}
            items={items}
            totals={totals}
            previewRef={previewRef}
            isExporting={isExporting}
            updateOffer={updateOffer}
            updateItem={updateItem}
            moveItem={moveItem}
            deleteItem={deleteItem}
          />
        </section>
      )}

      {activeView === 'details' && (
        <section className="data-page">
          <div className="page-title">
            <div>
              <p className="eyebrow">Angebotsdaten</p>
              <h2>Unternehmen & Rechtliches</h2>
            </div>
            <span>{offer.number}</span>
          </div>

          <section className="data-layout">
            <div className="data-form">
              <h3>Mein Unternehmen</h3>
              <Input label="Firma" value={offer.company.name} onChange={(value) => updateOffer('company.name', value)} />
              <Input label="Ansprechpartner" value={offer.company.contact} onChange={(value) => updateOffer('company.contact', value)} />
              <Input label="Vertreten durch" value={offer.company.representedBy || ''} onChange={(value) => updateOffer('company.representedBy', value)} />
              <LogoUpload
                logo={offer.company.logo || ''}
                onUpload={uploadCompanyLogo}
                onRemove={() => updateOffer('company.logo', '')}
              />
              <Input label="E-Mail" value={offer.company.email} onChange={(value) => updateOffer('company.email', value)} />
              <Input label="Telefon" value={offer.company.phone} onChange={(value) => updateOffer('company.phone', value)} />
              <Textarea label="Adresse" value={offer.company.address} onChange={(value) => updateOffer('company.address', value)} />
            </div>

            <div className="data-form">
              <h3>Rechtliches & Zahlung</h3>
              <Input label="USt/Steuer" value={offer.company.taxId} onChange={(value) => updateOffer('company.taxId', value)} />
              <Input label="Bankinstitut" value={offer.company.bankName || ''} onChange={(value) => updateOffer('company.bankName', value)} />
              <Input label="BIC" value={offer.company.bic || ''} onChange={(value) => updateOffer('company.bic', value)} />
              <Input label="Kontoinhaber" value={offer.company.accountHolder || ''} onChange={(value) => updateOffer('company.accountHolder', value)} />
              <Input label="IBAN" value={offer.company.iban} onChange={(value) => updateOffer('company.iban', value)} />
            </div>
          </section>
        </section>
      )}

      {activeView === 'customers' && (
        <section className="data-page">
          <div className="page-title">
            <div>
              <p className="eyebrow">Datenbank</p>
              <h2>Stammkunden</h2>
            </div>
            <span>{customers.length} gespeichert</span>
          </div>

          <section className="data-layout">
            <div className="data-form">
              <h3>Neuen Kunden speichern</h3>
              <Input label="Unternehmen" value={customerDraft.name} onChange={(value) => updateCustomerDraft('name', value)} />
              <Input label="Ansprechpartner" value={customerDraft.contact} onChange={(value) => updateCustomerDraft('contact', value)} />
              <Input label="E-Mail" value={customerDraft.email} onChange={(value) => updateCustomerDraft('email', value)} />
              <Input label="Telefon" value={customerDraft.phone} onChange={(value) => updateCustomerDraft('phone', value)} />
              <Textarea label="Adresse" value={customerDraft.address} onChange={(value) => updateCustomerDraft('address', value)} />
              <button className="primary-button full-width" type="button" onClick={saveCustomerDraft}>
                <Save size={18} /> Stammkunde speichern
              </button>
            </div>

            <div className="data-list">
              {customers.length === 0 && <EmptyState icon={<UsersRound size={24} />} title="Noch keine Stammkunden" text="Speichere Kunden aus einem Angebot oder lege sie hier direkt an." />}
              {customers.map((customer) => (
                <article className="customer-row" key={customer.id}>
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{customer.contact}</span>
                    <span>{customer.email}</span>
                    <span>{customer.phone}</span>
                    <span>{customer.address}</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => applyCustomer(customer)} title="Ins Angebot übernehmen" aria-label="Ins Angebot übernehmen">
                      <FileText size={15} />
                    </button>
                    <button type="button" onClick={() => deleteCustomer(customer.id)} title="Löschen" aria-label="Löschen">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {activeView === 'offers' && (
        <section className="data-page">
          <div className="page-title">
            <div>
              <p className="eyebrow">Archiv</p>
              <h2>Erstellte Angebote</h2>
            </div>
            <span>{savedOffers.length} gespeichert</span>
          </div>

          <label className="search-field">
            <Search size={18} />
            <input value={offerSearch} onChange={(event) => setOfferSearch(event.target.value)} placeholder="Angebote suchen" />
          </label>

          <div className="offers-list">
            {filteredOffers.length === 0 && <EmptyState icon={<ListChecks size={24} />} title="Keine Angebote gefunden" text="Gespeicherte Angebote erscheinen hier mit Nummer, Kunde, Datum und Gesamtbetrag." />}
            {filteredOffers.map((savedOffer) => (
              <article className="offer-row" key={savedOffer.id}>
                <div className="offer-row-main">
                  <strong>{savedOffer.number}</strong>
                  <span>{savedOffer.customer?.name || 'Ohne Kundenname'}</span>
                </div>
                <span>{formatDate(savedOffer.date)}</span>
                <span>{formatMoney(savedOffer.totals?.gross || 0)}</span>
                <div className="row-actions">
                  <button type="button" onClick={() => openSavedOffer(savedOffer)} title="Öffnen" aria-label="Öffnen">
                    <FileText size={15} />
                  </button>
                  <button type="button" onClick={() => deleteSavedOffer(savedOffer.id)} title="Löschen" aria-label="Löschen">
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {isItemOverlayOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
          <section className="item-dialog">
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Leistung</p>
                <h2 id="item-dialog-title">{editingId ? 'Leistung bearbeiten' : 'Leistung hinzufügen'}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsItemOverlayOpen(false)} title="Schließen" aria-label="Schließen">
                <X size={19} />
              </button>
            </div>

            {!editingId && (
              <div className="preset-row" aria-label="Leistungsvorlagen">
                {servicePresets.map((preset) => (
                  <button key={preset.title} type="button" onClick={() => setDraftItem({ ...emptyItem, ...preset })}>
                    {preset.title}
                  </button>
                ))}
              </div>
            )}

            <div className="dialog-grid">
              <Select label="Typ" value={draftItem.type} onChange={(value) => setDraftItem((item) => ({ ...itemTypes[value].defaults, ...item, type: value }))}>
                {Object.entries(itemTypes).map(([type, config]) => <option key={type} value={type}>{config.label}</option>)}
              </Select>
              <Input label="Titel" value={draftItem.title} onChange={(value) => setDraftItem((item) => ({ ...item, title: value }))} />
              {draftItem.type !== 'heading' && draftItem.type !== 'separator' && (
                <Textarea label="Beschreibung" value={draftItem.description} onChange={(value) => setDraftItem((item) => ({ ...item, description: value }))} />
              )}
              {isPricedItem(draftItem) && (
                <>
                  {draftItem.type !== 'flat' && (
                    <>
                      <Input label="Menge" type="number" value={draftItem.quantity} onChange={(value) => setDraftItem((item) => ({ ...item, quantity: value }))} />
                      <Input label="Einheit" value={draftItem.unit} onChange={(value) => setDraftItem((item) => ({ ...item, unit: value }))} />
                    </>
                  )}
                  <Input label="Einzelpreis" type="number" value={draftItem.unitPrice} onChange={(value) => setDraftItem((item) => ({ ...item, unitPrice: value }))} />
                  <Input label="Steuer %" type="number" value={draftItem.taxRate} onChange={(value) => setDraftItem((item) => ({ ...item, taxRate: value }))} />
                </>
              )}
            </div>

            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={saveItem}>
                <Save size={18} /> Speichern
              </button>
            </div>
          </section>
        </div>
      )}

      {activeView === 'editor' && (
        <section className="mobile-items" aria-label="Leistungspositionen">
          <div className="mobile-items-head">
            <h2>Leistungen</h2>
            <button className="primary-button" type="button" onClick={() => openNewItem()}><Plus size={18} /> Neu</button>
          </div>
          {items.map((item) => (
            <article className="line-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                {isPricedItem(item) && offer.showItemDetails !== false && (
                  <span>
                    {item.type === 'flat'
                      ? `${quantityUnitLabel(item)} ${formatMoney(Number(item.unitPrice || 0))}`
                      : `${quantityUnitLabel(item)} x ${formatMoney(Number(item.unitPrice || 0))}`}
                  </span>
                )}
              </div>
              <div className="line-actions">
                <button type="button" onClick={() => openEditItem(item)} title="Bearbeiten" aria-label="Bearbeiten"><Pencil size={17} /></button>
                <button type="button" onClick={() => deleteItem(item.id)} title="Löschen" aria-label="Löschen"><Trash2 size={17} /></button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

function OfferPreview({ offer, items, totals, previewRef, isExporting, updateOffer, updateItem, moveItem, deleteItem }) {
  const showItemDetails = offer.showItemDetails !== false

  return (
    <section className="preview-panel" aria-label="Angebotsvorschau">
      <div className="preview-topbar">
        <div>
          <p className="eyebrow">Live-Vorschau</p>
          <h2>{offer.number}</h2>
        </div>
        <div className="total-pill">{formatMoney(totals.gross)}</div>
      </div>

      <article className={`pdf-page${isExporting ? ' export-mode' : ''}`} ref={previewRef}>
        <header className="offer-header">
          <div>
            <p className="company-kicker">{offer.company.name}</p>
            <h2>{offer.title}</h2>
            <p className="muted">Angebotsnummer {offer.number}</p>
          </div>
          <div className="header-meta">
            {offer.company.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="offer-logo" src={offer.company.logo} alt={`${offer.company.name} Logo`} />
            )}
            <span>Datum: {offer.date}</span>
            <span>Gültig bis: {offer.validUntil}</span>
          </div>
        </header>

        <section className="address-band">
          <div>
            <p className="section-label">Kunde</p>
            <strong>{offer.customer.name}</strong>
            <span>{offer.customer.contact}</span>
            <span>{offer.customer.address}</span>
            <span>{offer.customer.email}</span>
            {offer.customer.phone && <span>{offer.customer.phone}</span>}
          </div>
          <div>
            <p className="section-label">Anbieter</p>
            <strong>{offer.company.name}</strong>
            <span>{offer.company.contact}</span>
            <span>{offer.company.address}</span>
            <span>{offer.company.email}</span>
            <span>{offer.company.phone}</span>
          </div>
        </section>

        <InlineTextarea
          className="intro-text"
          value={offer.intro}
          onChange={(value) => updateOffer('intro', value)}
          ariaLabel="Einleitung"
        />

        <div className="items-editor" aria-label="Leistungen bearbeiten">
          <div className={`items-head${showItemDetails ? '' : ' details-hidden'}`}>
            <span>Leistung</span>
            <label className="item-details-toggle">
              <span className="sr-only">Anzeige der Positionsdetails</span>
              <select
                value={showItemDetails ? 'show' : 'hide'}
                onChange={(event) => updateOffer('showItemDetails', event.target.value === 'show')}
              >
                <option value="show">Menge, Preis und Einheit einblenden</option>
                <option value="hide">Menge, Preis und Einheit ausblenden</option>
              </select>
            </label>
            <span></span>
          </div>
          {items.map((item, index) => (
            <EditableItem
              key={item.id}
              item={item}
              index={index}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              showItemDetails={showItemDetails}
              onChange={(patch) => updateItem(item.id, patch)}
              onMove={moveItem}
              onDelete={deleteItem}
            />
          ))}
        </div>

        <table className="items-table print-only">
          <thead>
            <tr>
              <th>Leistung</th>
              {showItemDetails && (
                <>
                  <th>Menge/Einheit</th>
                  <th>Preis</th>
                  <th>Netto</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <PrintItem key={item.id} item={item} showItemDetails={showItemDetails} />
            ))}
          </tbody>
        </table>

        <section className="summary-band">
          <dl className="totals-list">
            <div><dt>Zwischensumme</dt><dd>{formatMoney(totals.net)}</dd></div>
            <div className="adjustment-row">
              <dt>
                <select
                  value={offer.adjustment?.type || 'discount'}
                  onChange={(event) => updateOffer('adjustment.type', event.target.value)}
                  aria-label="Rabatt oder Aufschlag"
                >
                  <option value="discount">Rabatt</option>
                  <option value="surcharge">Aufschlag</option>
                </select>
                <input
                  type="number"
                  value={offer.adjustment?.value || 0}
                  onChange={(event) => updateOffer('adjustment.value', event.target.value)}
                  aria-label="Rabatt oder Aufschlag in Prozent"
                />
                <span>%</span>
              </dt>
              <dd>{formatMoney(totals.adjustment)}</dd>
            </div>
            <div><dt>Netto</dt><dd>{formatMoney(totals.adjustedNet)}</dd></div>
            <div><dt>Umsatzsteuer</dt><dd>{formatMoney(totals.tax)}</dd></div>
            <div className="grand-total"><dt>Gesamt</dt><dd>{formatMoney(totals.gross)}</dd></div>
          </dl>
        </section>

        <section className="payment-note">
          <p className="section-label">Zahlung & Hinweise</p>
          <InlineTextarea
            value={offer.legal.closingText}
            onChange={(value) => updateOffer('legal.closingText', value)}
            ariaLabel="Zahlung und rechtliche Hinweise"
            className="payment-terms-text"
          />
        </section>

        <footer className="legal-footer">
          <section>
            <h3>Unternehmen</h3>
            <span>{offer.company.name}</span>
            <span>{offer.company.address}</span>
            <span>{offer.company.taxId}</span>
            <span>Vertreten durch: {offer.company.representedBy || offer.company.contact}</span>
          </section>
          <section>
            <h3>Bankverbindung</h3>
            <span>Bankinstitut: {offer.company.bankName}</span>
            <span>BIC: {offer.company.bic}</span>
            <span>Kontoinhaber: {offer.company.accountHolder || offer.company.name}</span>
            <span>IBAN: {offer.company.iban}</span>
          </section>
        </footer>
      </article>
    </section>
  )
}

function EditableItem({ item, index, isFirst, isLast, showItemDetails, onChange, onMove, onDelete }) {
  const rowProps = {
    className: `editable-row ${item.type === 'separator' ? 'separator-row' : item.type === 'heading' ? 'heading-row' : 'detail-row'}${showItemDetails ? '' : ' details-hidden'}`,
  }

  if (item.type === 'separator') {
    return (
      <div {...rowProps}>
        <span className="row-index" aria-label={`Position ${index + 1}`}>{index + 1}</span>
        <div className="separator-line" />
        <RowActions item={item} isFirst={isFirst} isLast={isLast} onMove={onMove} onDelete={onDelete} />
      </div>
    )
  }

  if (item.type === 'heading') {
    return (
      <div {...rowProps}>
        <span className="row-index" aria-label={`Position ${index + 1}`}>{index + 1}</span>
        <div className="heading-fields">
          <InlineInput value={item.title} onChange={(value) => onChange({ title: value })} ariaLabel="Überschrift" />
        </div>
        <RowActions item={item} isFirst={isFirst} isLast={isLast} onMove={onMove} onDelete={onDelete} />
      </div>
    )
  }

  return (
    <div {...rowProps}>
      <span className="row-index" aria-label={`Position ${index + 1}`}>{index + 1}</span>
      <div className="item-title-cell">
        <InlineInput value={item.title} onChange={(value) => onChange({ title: value })} ariaLabel="Leistungstitel" />
        <InlineTextarea value={item.description} onChange={(value) => onChange({ description: value })} ariaLabel="Beschreibung" />
      </div>
      {showItemDetails && (
        <>
          {item.type === 'flat' ? (
            <span className="flat-unit-label">Pauschal</span>
          ) : (
            <div className="compact-group">
              <InlineInput type="number" value={item.quantity} onChange={(value) => onChange({ quantity: value })} ariaLabel="Menge" />
              <InlineInput value={item.unit} onChange={(value) => onChange({ unit: value })} ariaLabel="Einheit" />
            </div>
          )}
          <InlineInput type="number" value={item.unitPrice} onChange={(value) => onChange({ unitPrice: value })} ariaLabel="Einzelpreis" />
          <strong className="line-net">{formatMoney(lineNet(item))}</strong>
        </>
      )}
      <RowActions item={item} isFirst={isFirst} isLast={isLast} onMove={onMove} onDelete={onDelete} />
    </div>
  )
}

function RowActions({ item, isFirst, isLast, onMove, onDelete }) {
  return (
    <div className="row-actions">
      <button type="button" onClick={() => onMove(item.id, -1)} disabled={isFirst} title="Nach oben" aria-label="Nach oben">
        <ArrowUp size={15} />
      </button>
      <button type="button" onClick={() => onMove(item.id, 1)} disabled={isLast} title="Nach unten" aria-label="Nach unten">
        <ArrowDown size={15} />
      </button>
      <button type="button" onClick={() => onDelete(item.id)} title="Löschen" aria-label="Löschen">
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function PrintItem({ item, showItemDetails }) {
  const columnCount = showItemDetails ? 4 : 1

  if (item.type === 'separator') {
    return (
      <tr className="print-separator">
        <td colSpan={columnCount}></td>
      </tr>
    )
  }

  if (item.type === 'heading') {
    return (
      <tr className="print-heading">
        <td colSpan={columnCount}>
          <strong>{item.title}</strong>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <strong>{item.title}</strong>
        <span>{item.description}</span>
      </td>
      {showItemDetails && (
        <>
          <td>{quantityUnitLabel(item)}</td>
          <td>{formatMoney(Number(item.unitPrice || 0))}</td>
          <td>{formatMoney(lineNet(item))}</td>
        </>
      )}
    </tr>
  )
}

function Fieldset({ title, icon, children }) {
  return (
    <section className="form-section">
      <h2>{icon}{title}</h2>
      {children}
    </section>
  )
}

function LogoUpload({ logo, onUpload, onRemove }) {
  const inputRef = useRef(null)

  return (
    <div className="logo-upload">
      <span>Logo</span>
      <div className="logo-upload-row">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Aktuelles Firmenlogo" />
        ) : (
          <div className="logo-placeholder">Kein Logo</div>
        )}
        <div className="logo-upload-actions">
          <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
            Logo hochladen
          </button>
          {logo && (
            <button className="secondary-button" type="button" onClick={onRemove}>
              Entfernen
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(event) => {
          onUpload(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  )
}

function Textarea({ label, value, onChange }) {
  const textareaRef = useRef(null)
  useAutoResizeTextarea(textareaRef, value)

  return (
    <label className="field">
      <span>{label}</span>
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} rows={1} />
    </label>
  )
}

function InlineInput({ value, onChange, type = 'text', ariaLabel }) {
  return (
    <input
      className="inline-input"
      type={type}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function InlineTextarea({ value, onChange, ariaLabel, className = '' }) {
  const textareaRef = useRef(null)
  useAutoResizeTextarea(textareaRef, value)

  return (
    <textarea
      ref={textareaRef}
      className={`inline-textarea${className ? ` ${className}` : ''}`}
      value={value}
      aria-label={ariaLabel}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}
