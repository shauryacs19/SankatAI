// Health records (web parity): Timeline, Symptoms, Reports, Doctor report.
import { useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Activity, FileText, History } from 'lucide-react-native'
import ScreenHeader from '../../components/ScreenHeader'
import { useStyles } from './parts'
import TimelineView from './TimelineView'
import SymptomsView from './SymptomsView'
import ReportsView from './ReportsView'

const TABS = [
  { value: 'timeline', label: 'Timeline', Icon: History },
  { value: 'symptoms', label: 'Symptoms', Icon: Activity },
  { value: 'reports', label: 'Reports', Icon: FileText },
]

export default function HealthScreen({ navigation }) {
  const { colors, styles } = useStyles()
  const [tab, setTab] = useState('timeline')
  const [openReport, setOpenReport] = useState(null)

  return (
    <SafeAreaView style={styles.safe} edges={navigation?.shellManaged ? [] : ['top']}>
      <ScreenHeader title="Health records" navigation={navigation} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = tab === t.value
            return (
              <TouchableOpacity key={t.value} style={[styles.chip, on && styles.chipOn]} onPress={() => setTab(t.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <t.Icon size={15} color={on ? colors.primary : colors.textSecondary} /><Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'timeline' && <TimelineView navigation={navigation} onOpenReport={(id) => { setOpenReport(id); setTab('reports') }} />}
        {tab === 'symptoms' && <SymptomsView />}
        {tab === 'reports' && <ReportsView navigation={navigation} openId={openReport} onOpened={() => setOpenReport(null)} />}
      </View>
    </SafeAreaView>
  )
}
