import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { TransportOption, TransportSelection, PoiOption, TripPlan, Hotel } from "@/lib/types"

export type StepNumber = 1 | 2 | 3 | 4 | 5

interface TripState {
  currentStep: StepNumber

  // Step 1: 行程基本信息
  fromCity: string
  toCity: string
  departDate: string
  returnDate: string
  travelDays: number
  budgetLevel: string
  preferences: string[]
  setStep1: (data: { fromCity: string; toCity: string; departDate: string; returnDate: string; travelDays: number; budgetLevel: string; preferences: string[] }) => void

  // Step 2: 列车选择
  transportOptions: TransportOption[]
  selectedTransport: TransportSelection | null
  setTransportOptions: (options: TransportOption[]) => void
  selectTransport: (selection: TransportSelection) => void

  // Step 3: 景点选择
  poiOptions: PoiOption[]
  selectedPois: string[]
  setPoiOptions: (options: PoiOption[]) => void
  addPoi: (poiId: string) => void
  removePoi: (poiId: string) => void
  addCustomPoi: (name: string) => void

  // Step 4: 酒店选择
  hotelOptions: Hotel[]
  selectedHotel: Hotel | null
  setHotelOptions: (options: Hotel[]) => void
  selectHotel: (hotel: Hotel) => void

  // Step 5: 完整行程
  itinerary: TripPlan | null
  setItinerary: (plan: TripPlan) => void

  // Navigation
  goToStep: (step: StepNumber) => void
  reset: () => void

  // Meta
  isGenerating: boolean
  setIsGenerating: (v: boolean) => void
}

const initialState = {
  currentStep: 1 as StepNumber,
  fromCity: "",
  toCity: "",
  departDate: "",
  returnDate: "",
  travelDays: 3,
  budgetLevel: "comfort",
  preferences: [] as string[],
  transportOptions: [] as TransportOption[],
  selectedTransport: null as TransportSelection | null,
  poiOptions: [] as PoiOption[],
  selectedPois: [] as string[],
  hotelOptions: [] as Hotel[],
  selectedHotel: null as Hotel | null,
  itinerary: null as TripPlan | null,
  isGenerating: false,
}

export const useTripStore = create<TripState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Step 1
      setStep1: (data) => {
        const previous = get()
        // 目的地变了(或改了日期/天数)则下游数据全部失效，
        // 否则会把旧城市的景点/车次/酒店继续当成新行程的一部分。
        const destinationChanged =
          previous.toCity !== data.toCity ||
          previous.fromCity !== data.fromCity ||
          previous.departDate !== data.departDate ||
          previous.returnDate !== data.returnDate ||
          previous.travelDays !== data.travelDays ||
          previous.budgetLevel !== data.budgetLevel

        set({
          fromCity: data.fromCity,
          toCity: data.toCity,
          departDate: data.departDate,
          returnDate: data.returnDate,
          travelDays: data.travelDays,
          budgetLevel: data.budgetLevel,
          preferences: data.preferences,
          currentStep: 2,
          ...(destinationChanged && {
            transportOptions: [],
            selectedTransport: null,
            poiOptions: [],
            selectedPois: [],
            hotelOptions: [],
            selectedHotel: null,
            itinerary: null,
          }),
        })
      },

      // Step 2
      setTransportOptions: (options) => set({ transportOptions: options }),
      selectTransport: (selection) => set({ selectedTransport: selection, currentStep: 3 }),

      // Step 3
      setPoiOptions: (options) => {
        const ids = options.map((p) => p.name)
        set({ poiOptions: options, selectedPois: ids })
      },
      addPoi: (poiId) => {
        const current = get().selectedPois
        if (!current.includes(poiId)) set({ selectedPois: [...current, poiId] })
      },
      removePoi: (poiId) => set({ selectedPois: get().selectedPois.filter((id) => id !== poiId) }),
      addCustomPoi: (name) => {
        const newPoi: PoiOption = { id: `custom-${Date.now()}`, name, category: "自定义", address: "" }
        set({
          poiOptions: [...get().poiOptions, newPoi],
          selectedPois: [...get().selectedPois, name],
        })
      },

      // Step 4
      setHotelOptions: (options) => set({ hotelOptions: options }),
      selectHotel: (hotel) => set({ selectedHotel: hotel }),

      // Step 5
      setItinerary: (plan) => set({ itinerary: plan, isGenerating: false }),

      // Navigation
      goToStep: (step) => set({ currentStep: step }),
      reset: () => set(initialState),

      setIsGenerating: (v) => set({ isGenerating: v }),
    }),
    {
      name: "trip-planner-storage",
      skipHydration: true,
      partialize: (state) => ({
        fromCity: state.fromCity,
        toCity: state.toCity,
        departDate: state.departDate,
        returnDate: state.returnDate,
        travelDays: state.travelDays,
        selectedTransport: state.selectedTransport,
        selectedPois: state.selectedPois,
        selectedHotel: state.selectedHotel,
        itinerary: state.itinerary,
        currentStep: state.currentStep,
      }),
    }
  )
)
