// Quick-help topics: one tap starts a conversation about it. Shared by the
// home page (guest chat) and the signed-in chat's empty state. The prompt is
// sent as the person's first message; SankatAI then asks what it needs.
import { Bandage, Brain, HeartPulse, Soup, Thermometer, Wind } from 'lucide-react'

export const QUICK_TOPICS = [
  { key: 'fever', Icon: Thermometer, label: 'Fever or infection', prompt: 'I have a fever and I think I may have an infection.' },
  { key: 'head', Icon: Brain, label: 'Headache or dizziness', prompt: 'I have a headache and I feel dizzy.' },
  { key: 'breath', Icon: Wind, label: 'Cough or trouble breathing', prompt: 'I have a cough and some trouble breathing.' },
  { key: 'stomach', Icon: Soup, label: 'Stomach pain or vomiting', prompt: 'I have stomach pain and I have been vomiting.' },
  { key: 'injury', Icon: Bandage, label: 'Injury, cut or sprain', prompt: 'I have hurt myself and need help with an injury.' },
  { key: 'chest', Icon: HeartPulse, label: 'Chest pain or pressure', prompt: 'I have chest pain or pressure.' },
]
