import { createPushModal } from 'pushmodal'

import { TrackerDaySheet } from '#/components/sheets/tracker-day-sheet'
import { TrackerProjectSheet } from '#/components/sheets/tracker-project-sheet'

export const {
  pushModal: pushSheet,
  popModal: popSheet,
  ModalProvider: SheetProvider,
} = createPushModal({
  modals: {
    trackerProject: TrackerProjectSheet,
    trackerDay: TrackerDaySheet,
  },
})
