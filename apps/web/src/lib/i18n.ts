import { create } from 'zustand';

export type Language = 'uz' | 'ru';

export const DICTIONARY = {
  // Navigation
  map: { uz: 'Joylar xaritasi', ru: 'Карта мест' },
  bookings: { uz: 'Bronlar', ru: 'Брони' },
  quickSale: { uz: 'Tez kassa', ru: 'Быстрая касса' },
  shift: { uz: 'Smena', ru: 'Смена' },
  customers: { uz: 'Mijozlar', ru: 'Клиенты' },
  stock: { uz: 'Ombor', ru: 'Склад' },
  suppliers: { uz: 'Ta\'minotchilar', ru: 'Поставщики' },
  reports: { uz: 'Hisobotlar', ru: 'Отчеты' },
  tariffs: { uz: 'Tariflar', ru: 'Тарифы' },
  audit: { uz: 'Audit jurnali', ru: 'Журнал аудита' },
  settings: { uz: 'Sozlamalar', ru: 'Настройки' },
  logout: { uz: 'Chiqish', ru: 'Выход' },

  // Common UI
  save: { uz: 'Saqlash', ru: 'Сохранить' },
  cancel: { uz: 'Bekor qilish', ru: 'Отмена' },
  delete: { uz: 'O\'chirish', ru: 'Удалить' },
  edit: { uz: 'Tahrirlash', ru: 'Редактировать' },
  add: { uz: 'Qo\'shish', ru: 'Добавить' },
  loading: { uz: 'Yuklanmoqda…', ru: 'Загрузка…' },
  search: { uz: 'Qidirish…', ru: 'Поиск…' },
  all: { uz: 'Barchasi', ru: 'Все' },
  active: { uz: 'Faol', ru: 'Актив' },
  offlineAlert: {
    uz: '⚠ Internet aloqasi yo\'q! Kiritilgan amallar saqlanmasligi mumkin. Aloqa tiklanishi kutilmoqda…',
    ru: '⚠ Нет интернет-соединения! Введенные действия могут не сохраниться. Ожидание связи…',
  },

  // Station status
  free: { uz: 'Bo\'sh', ru: 'Свободно' },
  busy: { uz: 'Band', ru: 'Занято' },
  outOfService: { uz: 'Xizmatda emas', ru: 'Не работает' },
  start: { uz: 'Boshlash', ru: 'Начать' },
  finish: { uz: 'Tugashiga 10 daqiqa', ru: 'Осталось 10 мин' },
  timeOver: { uz: 'Vaqt tugadi', ru: 'Время истекло' },

  // Backup & System
  backupSection: { uz: 'Tizim va Zaxira nusxa (Backup)', ru: 'Система и Резервное копирование' },
  downloadBackup: { uz: 'Zaxira nusxani yuklab olish (JSON)', ru: 'Скачать резервную копию (JSON)' },
  downloadingBackup: { uz: 'Yuklab olinmoqda…', ru: 'Скачивается…' },
  backupHelp: {
    uz: 'Ushbu tugma orqali butun klub ma\'lumotlarini (joylar, tariflar, mijozlar, ombor, hisobotlar) JSON formatida xavfsiz yuklab olishingiz mumkin.',
    ru: 'С помощью этой кнопки вы можете безопасно скачать все данные клуба (места, тарифы, клиенты, склад, отчеты) в формате JSON.',
  },
  language: { uz: 'Interfeys tili', ru: 'Язык интерфейса' },
} as const;

export type TranslationKey = keyof typeof DICTIONARY;

interface I18nState {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = 'psklub_lang';

export const useI18n = create<I18nState>((set, get) => ({
  lang: (typeof localStorage !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as Language)) || 'uz',
  setLang: (lang: Language) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
    set({ lang });
  },
  t: (key: TranslationKey) => {
    const item = DICTIONARY[key];
    if (!item) return String(key);
    return item[get().lang] ?? item.uz;
  },
}));
