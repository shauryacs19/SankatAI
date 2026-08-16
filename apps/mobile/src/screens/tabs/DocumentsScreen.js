import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, Switch, TextInput, ActivityIndicator, Animated, PanResponder } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { Upload, Image as ImageIcon, FileText, FolderOpen, Folder, Trash2, Lock, Eye, ShieldCheck, X, Pencil, Plus, Check, LayoutGrid, List } from 'lucide-react-native'
import { radius } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import ScreenHeader from '../../components/ScreenHeader'
import { listUploads, deleteUpload, updateUpload, getDownloadUrl, uploadFile, kindForAsset } from '../../lib/uploads'
import { listPins } from '../../lib/api'
import CreatePinModal from '../../components/CreatePinModal'
import FilePreview from '../../components/FilePreview'
import { isImageFile, openInAppBrowser } from '../../lib/preview'
import usePullRefresh from '../../components/usePullRefresh'
import {
  fmtFileSize, typeLabel, fmtDate, mergeCategories, VIEW_STORAGE_KEY, DEFAULT_DOC_VIEW,
  normalizeDocView, nextDocView, readProfileCategories, addProfileCategory,
  removeProfileCategory, isDeleteConfirmed, DELETE_CONFIRM_TEXT,
} from '../../lib/documents'
import { useProfile } from '../../context/ProfileContext'
import { saveProfile } from '../../lib/api'

const loadView = async () => { try { return normalizeDocView(await SecureStore.getItemAsync(VIEW_STORAGE_KEY)) } catch { return DEFAULT_DOC_VIEW } }
const saveView = (v) => { SecureStore.setItemAsync(VIEW_STORAGE_KEY, v).catch(() => {}) }

export default function DocumentsScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pins, setPins] = useState([])
  const { profile, loading: profileLoading, setProfile } = useProfile()
  const customCats = readProfileCategories(profile)
  const [view, setView] = useState(DEFAULT_DOC_VIEW)
  const [activeCardId, setActiveCardId] = useState(null) // grid card whose actions are revealed
  const toggleView = () => setView((v) => { const n = nextDocView(v); saveView(n); setActiveCardId(null); return n })

  // upload options modal
  const [pending, setPending] = useState(null) // asset { uri, name, mimeType, size }
  const [uploadName, setUploadName] = useState('') // user-editable filename (web parity)
  const [protect, setProtect] = useState(false)
  const [pinId, setPinId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)

  // PIN prompt for protected files — { attachment, mode: 'view' | 'delete' }
  const [pinPrompt, setPinPrompt] = useState(null)
  const [pinValue, setPinValue] = useState('')
  const [opening, setOpening] = useState(false)
  const [preview, setPreview] = useState(null) // { url, name } — in-app image preview

  // edit (rename + category) + new-category modals
  const [editTarget, setEditTarget] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // hold-and-drag between categories (RN PanResponder — no gesture-handler dep)
  const [dragItem, setDragItem] = useState(null)   // file currently being dragged
  const [hoverKey, setHoverKey] = useState(null)   // category section under the finger
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const dragRef = useRef(null)                     // synchronous mirror of dragItem
  const holdTimer = useRef(null)
  const sectionNodes = useRef({})                  // sectionKey -> View ref
  const sectionRects = useRef([])                  // measured once per drag (scroll is locked)
  const dragPos = useRef(new Animated.ValueXY()).current

  // typed delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteText, setDeleteText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deletePin, setDeletePin] = useState(null) // PIN collected before the confirm step

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const l = await listUploads('vault'); setItems(Array.isArray(l) ? l : []) }
    catch (e) { setError(e.message || 'Could not load files.') }
    finally { setLoading(false) }
  }, [])
  const loadPins = useCallback(async () => { try { const l = await listPins(); setPins(Array.isArray(l) ? l : []) } catch { /* ignore */ } }, [])
  useEffect(() => { load(); loadPins(); loadView().then(setView) }, [load, loadPins])
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current) }, [])
  const onPullRefresh = useCallback(async () => { await Promise.all([load(), loadPins()]) }, [load, loadPins])
  // no reload while a file is being held/dragged
  const refreshControl = usePullRefresh(onPullRefresh, !dragItem)

  // Custom categories live on the PROFILE (profile.fileCategories) so web and
  // mobile stay in sync. Profile PUT replaces the whole record — always merge.
  const persistCats = async (next) => {
    if (profileLoading) { Alert.alert('Still loading your profile — try again in a moment.'); return }
    const prev = profile
    const merged = { ...(profile || {}), fileCategories: next }
    setProfile(merged)
    try { await saveProfile(merged) }
    catch (e) { setProfile(prev); Alert.alert('Could not save the category.', e.message || '') }
  }
  const addCustomCat = (name) => {
    const next = addProfileCategory(customCats, name)
    if (next !== customCats) persistCats(next)
  }
  const removeCustomCat = (name) => persistCats(removeProfileCategory(customCats, name))

  const categories = mergeCategories(items, customCats)
  const uncategorized = items.filter((f) => !f.category)

  const startUpload = (asset) => { setPending(asset); setUploadName(asset?.name || ''); setProtect(false); setPinId(null) }

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      const a = !res.canceled && res.assets?.[0]
      if (a) startUpload({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream', size: a.size })
    } catch { Alert.alert('Could not open the document picker.') }
  }
  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return Alert.alert('Photo access is needed to attach images.')
      const res = await ImagePicker.launchImageLibraryAsync({})
      const a = !res.canceled && res.assets?.[0]
      if (a) startUpload({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize })
    } catch { Alert.alert('Could not open the photo picker.') }
  }
  // Single entry point — choose the source once (like the web's upload form).
  const startNewUpload = () => {
    Alert.alert('Upload a file', 'What would you like to upload?', [
      { text: 'Photo', onPress: pickPhoto },
      { text: 'Document', onPress: pickDocument },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const doUpload = async () => {
    if (!pending) return
    const name = uploadName.trim()
    if (!name) { Alert.alert('Enter a file name.'); return }
    if (protect && !pinId) { Alert.alert('Choose a PIN to protect this file, or turn off protection.'); return }
    setUploading(true)
    try {
      // Filename is sent verbatim, same as the web upload form.
      await uploadFile({ ...pending, name }, { scope: 'vault', kind: kindForAsset(pending), passwordProtected: protect, pinId })
      setPending(null)
      await load()
    } catch (e) { Alert.alert('Upload failed', e.message || 'Please try again.') }
    finally { setUploading(false) }
  }

  // Previews stay inside the app: images in the FilePreview modal, everything
  // else in the in-app browser (expo-web-browser).
  const openFile = async (att, pin = null) => {
    setOpening(true)
    try {
      const { downloadUrl } = await getDownloadUrl(att.attachmentId, pin, 'inline')
      setPinPrompt(null); setPinValue('')
      if (isImageFile(att)) setPreview({ url: downloadUrl, name: att.filename })
      else if (!(await openInAppBrowser(downloadUrl, colors))) Alert.alert('Could not open the file.')
    } catch (e) {
      if (att.passwordProtected) Alert.alert('Incorrect PIN', 'Please try again.')
      else Alert.alert('Could not open the file.', e.message || '')
    } finally { setOpening(false) }
  }
  const onView = (att) => (att.passwordProtected ? (setPinPrompt({ attachment: att, mode: 'view' }), setPinValue('')) : openFile(att))

  const openEdit = (att) => { setEditTarget(att); setEditName(att.filename || ''); setEditCat(att.category || '') }
  const submitEdit = async () => {
    const name = editName.trim()
    if (!name || editBusy) return
    const category = editCat.trim()
    setEditBusy(true)
    try {
      const updated = await updateUpload(editTarget.attachmentId, { filename: name, category })
      if (category) addCustomCat(category)
      setItems((p) => p.map((x) => (x.attachmentId === editTarget.attachmentId
        ? { ...x, filename: updated?.filename || name, category: updated?.category ?? (category || null) } : x)))
      setEditTarget(null)
    } catch (e) { Alert.alert('Could not update the file.', e.message || '') }
    finally { setEditBusy(false) }
  }

  const submitNewCat = () => { const n = newCatName.trim(); if (!n) return; addCustomCat(n); setNewCatOpen(false); setNewCatName('') }

  // Protected files are PIN-gated BEFORE the typed confirmation. The PIN is
  // verified server-side on the DELETE call, so a wrong one deletes nothing.
  const onDelete = (att) => {
    if (att.passwordProtected) { setPinPrompt({ attachment: att, mode: 'delete' }); setPinValue(''); return }
    setDeleteTarget(att); setDeleteText(''); setDeletePin(null)
  }
  const submitDelete = async () => {
    if (!isDeleteConfirmed(deleteText) || deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteUpload(deleteTarget.attachmentId, deletePin)
      setItems((p) => p.filter((x) => x.attachmentId !== deleteTarget.attachmentId))
      setDeleteTarget(null); setDeletePin(null)
    } catch (e) {
      if (/403|incorrect pin/i.test(e.message || '')) {
        // PIN changed / wrong — restart at the PIN step.
        const att = deleteTarget
        setDeleteTarget(null); setDeletePin(null)
        setPinPrompt({ attachment: att, mode: 'delete' }); setPinValue('')
        Alert.alert('Incorrect PIN', 'Please try again.')
      } else Alert.alert('Could not delete.', e.message || '')
    }
    finally { setDeleteBusy(false) }
  }

  // Same optimistic updateUpload + rollback as the web's drop handler.
  const moveFileToCategory = async (att, category) => {
    if (!att || (att.category || '') === (category || '')) return
    const prevCat = att.category || null
    setItems((p) => p.map((x) => (x.attachmentId === att.attachmentId ? { ...x, category: category || null } : x)))
    try {
      await updateUpload(att.attachmentId, { category: category || '' })
      if (category) addCustomCat(category)
    } catch (e) {
      setItems((p) => p.map((x) => (x.attachmentId === att.attachmentId ? { ...x, category: prevCat } : x)))
      Alert.alert('Could not move the file.', e.message || '')
    }
  }

  // --- hold-and-drag: press and hold a file, drag it onto a category heading ---
  // Drop targets are measured in window coords once the drag starts; scrolling is
  // locked for the duration so the rects stay valid.
  const HOLD_MS = 300
  const cancelHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null } }

  const beginDrag = (it, x, y) => {
    dragRef.current = it
    setDragItem(it)
    setActiveCardId(null)
    setScrollEnabled(false)
    dragPos.setValue({ x: x - 90, y: y - 26 })
    sectionRects.current = []
    // rects are measured in the effect below, after the render that mounts the
    // drag-only sections (Uncategorized appears while dragging)
  }

  // Measure drop targets once per drag (scrolling is locked, so they stay valid).
  useEffect(() => {
    if (!dragItem) { sectionRects.current = []; return }
    const rects = []
    Object.entries(sectionNodes.current).forEach(([key, node]) => {
      node?.measureInWindow?.((mx, my, width, height) => {
        if (width && height) rects.push({ key, category: key === '__uncat__' ? '' : key, x: mx, y: my, width, height })
      })
    })
    sectionRects.current = rects
  }, [dragItem])

  const endDrag = (drop) => {
    cancelHold()
    const it = dragRef.current
    dragRef.current = null
    setDragItem(null)
    setHoverKey(null)
    setScrollEnabled(true)
    if (it && drop !== null && drop !== undefined) moveFileToCategory(it, drop)
  }

  const hitSection = (x, y) => sectionRects.current.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)

  const dragHandlers = (it) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => Boolean(dragRef.current),
    // Let the ScrollView steal the touch for normal scrolling, but never once
    // the hold has armed the drag.
    onPanResponderTerminationRequest: () => !dragRef.current,
    onPanResponderGrant: (e) => {
      const { pageX, pageY } = e.nativeEvent
      cancelHold()
      holdTimer.current = setTimeout(() => beginDrag(it, pageX, pageY), HOLD_MS)
    },
    onPanResponderMove: (e, g) => {
      if (!dragRef.current) {
        // moved before the hold armed -> treat as a scroll/tap, not a drag
        if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) cancelHold()
        return
      }
      dragPos.setValue({ x: g.moveX - 90, y: g.moveY - 26 })
      const hit = hitSection(g.moveX, g.moveY)
      setHoverKey(hit ? hit.key : null)
    },
    onPanResponderRelease: (e, g) => {
      if (!dragRef.current) {
        cancelHold()
        // a plain tap on a grid card toggles its action overlay
        if (view === 'grid' && Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          setActiveCardId((cur) => (cur === it.attachmentId ? null : it.attachmentId))
        }
        return
      }
      const hit = hitSection(g.moveX, g.moveY)
      endDrag(hit ? hit.category : null)
    },
    onPanResponderTerminate: () => { cancelHold(); if (dragRef.current) endDrag(null) },
  })

  // Same fields in both views — only the layout differs (list = full-width row,
  // grid = centred card whose actions appear on tap, over a dimmed card).
  const actionButtons = (it, overlay = false) => {
    const s = overlay ? styles.cardActBtn : styles.iconBtn
    return (
      <>
        <TouchableOpacity style={s} onPress={() => onView(it)} hitSlop={6}><Eye size={17} color={colors.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={s} onPress={() => openEdit(it)} hitSlop={6}><Pencil size={16} color={colors.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={s} onPress={() => onDelete(it)} hitSlop={6}><Trash2 size={16} color={colors.muted} /></TouchableOpacity>
      </>
    )
  }

  const fileCard = (it) => {
    const meta = [typeLabel(it.contentType) || (it.kind === 'photo' ? 'Photo' : 'Document'), fmtDate(it.createdAt), fmtFileSize(it.size)].filter(Boolean).join(' · ')
    const icon = it.kind === 'photo' ? <ImageIcon size={24} color={colors.primary} /> : <FileText size={24} color={colors.primary} />

    const beingDragged = dragItem?.attachmentId === it.attachmentId

    if (view === 'grid') {
      const active = activeCardId === it.attachmentId
      return (
        <View
          key={it.attachmentId}
          style={[styles.fileCard, beingDragged && { opacity: 0.4 }]}
          {...dragHandlers(it).panHandlers}
        >
          <View style={[styles.cardBody, active && { opacity: 0.35 }]}>
            <View style={styles.fileIconLg}>{icon}</View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={2} style={[styles.fileName, { textAlign: 'center' }]}>{it.filename}</Text>
              {it.passwordProtected && <Lock size={12} color={colors.muted} />}
            </View>
            <Text numberOfLines={2} style={[styles.fileMeta, { textAlign: 'center' }]}>{meta}</Text>
          </View>
          {active && (
            <>
              <View style={styles.cardScrim} pointerEvents="none" />
              <View style={styles.cardActions}>{actionButtons(it, true)}</View>
            </>
          )}
        </View>
      )
    }

    return (
      <View
        key={it.attachmentId}
        style={[styles.fileRow, beingDragged && { opacity: 0.4 }]}
        {...dragHandlers(it).panHandlers}
      >
        <View style={styles.fileIcon}>{it.kind === 'photo' ? <ImageIcon size={20} color={colors.primary} /> : <FileText size={20} color={colors.primary} />}</View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={styles.fileName}>{it.filename}</Text>
            {it.passwordProtected && <Lock size={12} color={colors.muted} />}
          </View>
          <Text numberOfLines={2} style={styles.fileMeta}>{meta}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>{actionButtons(it)}</View>
      </View>
    )
  }

  const catSection = (heading, list, { removable = false, sectionKey = heading } = {}) => (
    <View
      key={heading}
      style={[styles.catGroup, hoverKey === sectionKey && styles.catGroupHover]}
      ref={(node) => { sectionNodes.current[sectionKey] = node }}
      collapsable={false}
    >
      <View style={styles.catHead}>
        <Folder size={15} color={colors.muted} />
        <Text style={styles.catTitle}>{heading}</Text>
        <Text style={styles.catCount}>{list.length}</Text>
        {removable && list.length === 0 && (
          <TouchableOpacity onPress={() => removeCustomCat(heading)} hitSlop={8} style={{ padding: 4 }}>
            <X size={14} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
      {list.length
        ? <View style={view === 'grid' ? styles.gridWrap : styles.listWrap}>{list.map(fileCard)}</View>
        : <Text style={styles.catEmpty}>Empty — hold a file and drag it here.</Text>}
    </View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Documents" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl} scrollEnabled={scrollEnabled}>
        <Text style={styles.sub}>Your secure vault. Files upload to storage and can be locked with a security PIN. Hold a file and drag it onto a category to move it.</Text>

        <View style={styles.uploadRow}>
          <TouchableOpacity style={styles.uploadBtn} onPress={startNewUpload}><Upload size={15} color="#fff" /><Text style={styles.uploadText}>Upload file</Text></TouchableOpacity>
          <TouchableOpacity style={styles.catBtn} onPress={() => { setNewCatOpen(true); setNewCatName('') }}><Plus size={15} color={colors.primary} /><Text style={styles.catBtnText}>Category</Text></TouchableOpacity>
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={toggleView}
            accessibilityRole="button"
            accessibilityLabel={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          >
            {view === 'grid' ? <List size={17} color={colors.primary} /> : <LayoutGrid size={17} color={colors.primary} />}
          </TouchableOpacity>
        </View>

        {!!error && <View style={styles.errBox}><Text style={styles.errText}>{error}</Text></View>}

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : items.length === 0 && categories.length === 0 ? (
          <View style={styles.empty}><FolderOpen size={34} color={colors.muted} /><Text style={styles.emptyText}>No files yet.</Text></View>
        ) : (
          <View style={{ marginTop: 16, gap: 14 }}>
            {categories.map((cat) => catSection(cat, items.filter((f) => f.category === cat), { removable: true }))}
            {/* Only shown when it holds files — or while dragging, so a file can be
                dropped back out of a category. */}
            {(uncategorized.length > 0 || !!dragItem) && catSection('Uncategorized', uncategorized, { sectionKey: '__uncat__' })}
          </View>
        )}
      </ScrollView>

      {/* Floating drag ghost — follows the finger while a file is held */}
      {!!dragItem && (
        <Animated.View pointerEvents="none" style={[styles.dragGhost, { transform: dragPos.getTranslateTransform() }]}>
          {dragItem.kind === 'photo' ? <ImageIcon size={16} color={colors.primary} /> : <FileText size={16} color={colors.primary} />}
          <Text numberOfLines={1} style={styles.dragGhostText}>{dragItem.filename}</Text>
        </Animated.View>
      )}

      {/* Upload options */}
      <Modal visible={!!pending} animationType="slide" transparent onRequestClose={() => !uploading && setPending(null)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Upload file</Text>
              <TouchableOpacity onPress={() => setPending(null)} disabled={uploading}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>

            <View style={styles.pendingRow}>
              <View style={styles.fileIcon}>{pending?.mimeType?.startsWith('image/') ? <ImageIcon size={20} color={colors.primary} /> : <FileText size={20} color={colors.primary} />}</View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.fileName}>{pending?.name}</Text>
                <Text style={styles.fileMeta}>{fmtFileSize(pending?.size)}</Text>
              </View>
            </View>

            <Text style={[styles.optLabel, { marginTop: 16 }]}>File name</Text>
            <TextInput
              style={styles.editInput}
              value={uploadName}
              onChangeText={setUploadName}
              maxLength={120}
              placeholder="Enter file name"
              placeholderTextColor={colors.muted}
              editable={!uploading}
            />

            <View style={styles.optRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <ShieldCheck size={16} color={colors.primary} />
                <Text style={styles.optLabel}>Password-protect this file</Text>
              </View>
              <Switch value={protect} onValueChange={setProtect} trackColor={{ true: colors.primary }} />
            </View>

            {protect && (
              pins.length === 0 ? (
                <View>
                  <Text style={styles.hint}>Your account doesn’t have a PIN created.</Text>
                  <TouchableOpacity style={styles.setupPinBtn} onPress={() => setPinModalOpen(true)}>
                    <ShieldCheck size={15} color={colors.primary} />
                    <Text style={styles.setupPinText}>Set up a PIN</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.pinWrap}>
                  {pins.map((p) => (
                    <TouchableOpacity key={p.id} style={[styles.pinChip, pinId === p.id && styles.pinChipOn]} onPress={() => setPinId(p.id)}>
                      <Lock size={12} color={pinId === p.id ? colors.primary : colors.muted} />
                      <Text style={[styles.pinChipText, pinId === p.id && { color: colors.primary }]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.ghost} onPress={() => setPending(null)} disabled={uploading}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, (uploading || !uploadName.trim()) && { opacity: 0.6 }]} onPress={doUpload} disabled={uploading || !uploadName.trim()}>
                {uploading ? <ActivityIndicator color="#fff" /> : <><Upload size={15} color="#fff" /><Text style={styles.primaryText}>Upload</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Create a PIN without leaving the upload sheet. */}
        <CreatePinModal
          visible={pinModalOpen}
          onClose={() => setPinModalOpen(false)}
          onCreated={(created) => { setPins((prev) => [...prev, created]); setPinId(created.id); setPinModalOpen(false) }}
        />
      </Modal>

      {/* Edit: rename + category */}
      <Modal visible={!!editTarget} animationType="fade" transparent onRequestClose={() => !editBusy && setEditTarget(null)}>
        <View style={styles.scrimCenter}>
          <View style={styles.pinModal}>
            <View style={styles.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pencil size={15} color={colors.primary} /><Text style={styles.sheetTitle}>Edit file</Text></View>
              <TouchableOpacity onPress={() => setEditTarget(null)}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>
            <Text style={styles.optLabel}>File name</Text>
            <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} maxLength={120} placeholder="File name" placeholderTextColor={colors.muted} />
            <Text style={[styles.optLabel, { marginTop: 12 }]}>Category</Text>
            <View style={styles.pinWrap}>
              <TouchableOpacity style={[styles.pinChip, !editCat && styles.pinChipOn]} onPress={() => setEditCat('')}>
                <Text style={[styles.pinChipText, !editCat && { color: colors.primary }]}>Uncategorized</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity key={c} style={[styles.pinChip, editCat === c && styles.pinChipOn]} onPress={() => setEditCat(c)}>
                  <Text style={[styles.pinChipText, editCat === c && { color: colors.primary }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.editInput, { marginTop: 10 }]} value={editCat} onChangeText={setEditCat} maxLength={60} placeholder="Or type a new category" placeholderTextColor={colors.muted} />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.ghost} onPress={() => setEditTarget(null)} disabled={editBusy}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, (!editName.trim() || editBusy) && { opacity: 0.6 }]} onPress={submitEdit} disabled={!editName.trim() || editBusy}>
                {editBusy ? <ActivityIndicator color="#fff" /> : <><Check size={15} color="#fff" /><Text style={styles.primaryText}>Save</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New category */}
      <Modal visible={newCatOpen} animationType="fade" transparent onRequestClose={() => setNewCatOpen(false)}>
        <View style={styles.scrimCenter}>
          <View style={styles.pinModal}>
            <View style={styles.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Plus size={15} color={colors.primary} /><Text style={styles.sheetTitle}>New category</Text></View>
              <TouchableOpacity onPress={() => setNewCatOpen(false)}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>
            <TextInput style={styles.editInput} value={newCatName} onChangeText={setNewCatName} maxLength={60} autoFocus placeholder="e.g. Prescriptions" placeholderTextColor={colors.muted} />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.ghost} onPress={() => setNewCatOpen(false)}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, !newCatName.trim() && { opacity: 0.6 }]} onPress={submitNewCat} disabled={!newCatName.trim()}>
                <Check size={15} color="#fff" /><Text style={styles.primaryText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete — requires typing "confirm", same as the web */}
      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={() => !deleteBusy && setDeleteTarget(null)}>
        <View style={styles.scrimCenter}>
          <View style={styles.pinModal}>
            <View style={styles.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
                <Trash2 size={15} color={colors.primary} />
                <Text style={styles.sheetTitle}>Delete this file permanently?</Text>
              </View>
              <TouchableOpacity onPress={() => setDeleteTarget(null)} disabled={deleteBusy}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>
            <Text style={styles.hint}>Files cannot be retrieved after deletion.</Text>
            <Text style={[styles.optLabel, { marginTop: 12 }]}>To confirm, type “{DELETE_CONFIRM_TEXT}” below</Text>
            <TextInput
              style={styles.editInput}
              value={deleteText}
              onChangeText={setDeleteText}
              placeholder={DELETE_CONFIRM_TEXT}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleteBusy}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.ghost} onPress={() => setDeleteTarget(null)} disabled={deleteBusy}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, (!isDeleteConfirmed(deleteText) || deleteBusy) && { opacity: 0.6 }]} onPress={submitDelete} disabled={!isDeleteConfirmed(deleteText) || deleteBusy}>
                {deleteBusy ? <ActivityIndicator color="#fff" /> : <><Trash2 size={15} color="#fff" /><Text style={styles.primaryText}>Delete</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN prompt for protected files — required to view AND to delete */}
      <Modal visible={!!pinPrompt} animationType="fade" transparent onRequestClose={() => setPinPrompt(null)}>
        <View style={styles.scrimCenter}>
          <View style={styles.pinModal}>
            <View style={styles.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Lock size={15} color={colors.primary} /><Text style={styles.sheetTitle}>Enter PIN</Text></View>
              <TouchableOpacity onPress={() => setPinPrompt(null)}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              {pinPrompt?.mode === 'delete'
                ? 'This file is protected. Enter its 6-digit PIN to continue with deletion.'
                : 'This file is protected. Enter its 6-digit PIN to open it.'}
            </Text>
            <TextInput
              style={styles.pinInput}
              value={pinValue}
              onChangeText={(t) => setPinValue(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.ghost} onPress={() => setPinPrompt(null)}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              {pinPrompt?.mode === 'delete' ? (
                <TouchableOpacity
                  style={[styles.primary, pinValue.length !== 6 && { opacity: 0.6 }]}
                  disabled={pinValue.length !== 6}
                  onPress={() => {
                    const att = pinPrompt.attachment
                    setDeletePin(pinValue); setPinPrompt(null); setPinValue('')
                    setDeleteTarget(att); setDeleteText('')
                  }}
                >
                  <Check size={15} color="#fff" /><Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.primary, (pinValue.length !== 6 || opening) && { opacity: 0.6 }]} disabled={pinValue.length !== 6 || opening} onPress={() => openFile(pinPrompt.attachment, pinValue)}>
                  {opening ? <ActivityIndicator color="#fff" /> : <><Eye size={15} color="#fff" /><Text style={styles.primaryText}>Open</Text></>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* In-app image preview */}
      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18 },
  sub: { color: colors.muted, marginTop: 4, fontSize: 13, lineHeight: 19 },
  uploadRow: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.primary },
  uploadText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: colors.surface },
  catBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  errBox: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 14 },
  errText: { color: colors.primary, fontSize: 13 },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 60, marginTop: 20, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.lg },
  emptyText: { color: colors.muted },
  catGroup: { gap: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.md, padding: 4 },
  catGroupHover: { borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.primarySoft },
  dragGhost: { position: 'absolute', top: 0, left: 0, zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  dragGhostText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  catTitle: { fontSize: 13, fontWeight: '800', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  catCount: { fontSize: 12, color: colors.muted, fontWeight: '700', backgroundColor: colors.surface2, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 1 },
  catEmpty: { color: colors.muted, fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
  viewBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: colors.surface },
  listWrap: { gap: 8 },
  // exactly two per row — cards never grow to fill a half-empty row
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10, alignItems: 'flex-start' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  fileCard: { width: '48.5%', minHeight: 160, justifyContent: 'center', padding: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  cardBody: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  fileIconLg: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  // ~90% opaque scrim — RN has no CSS blur, so the card content dims out behind the actions.
  cardScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, opacity: 0.9 },
  cardActions: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cardActBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  fileMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  iconBtn: { padding: 6 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  scrimCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  optRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  optLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { color: colors.muted, fontSize: 12, marginTop: 10, lineHeight: 17 },
  setupPinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10 },
  setupPinText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  pinWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pinChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface },
  pinChipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pinChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  editInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.bg, marginTop: 6 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  ghost: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.surface2 },
  ghostText: { color: colors.textSecondary, fontWeight: '700' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { color: '#fff', fontWeight: '700' },
  pinModal: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  pinInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: colors.text, backgroundColor: colors.bg, letterSpacing: 6, textAlign: 'center', marginTop: 12 },
})
