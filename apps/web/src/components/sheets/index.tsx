import { createPushModal } from 'pushmodal'
import { InboxAttachmentSheet } from '#/components/sheets/inbox-attachment-sheet'
import { PersonalAccountSheet } from '#/components/sheets/personal-account-sheet'
import { PersonalTransactionSheet } from '#/components/sheets/personal-transaction-sheet'
import { TrackerDaySheet } from '#/components/sheets/tracker-day-sheet'
import { TrackerProjectSheet } from '#/components/sheets/tracker-project-sheet'
import { TransactionSheet } from '#/components/sheets/transaction-sheet'

export const {
  pushModal: pushSheet,
  popModal: popSheet,
  ModalProvider: SheetProvider,
} = createPushModal({
  modals: {
    transaction: TransactionSheet,
    personalTransaction: PersonalTransactionSheet,
    personalAccount: PersonalAccountSheet,
    trackerProject: TrackerProjectSheet,
    trackerDay: TrackerDaySheet,
    inboxAttachment: InboxAttachmentSheet,
  },
})
