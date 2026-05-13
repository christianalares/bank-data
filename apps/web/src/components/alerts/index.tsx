import { createPushModal } from 'pushmodal'
import { ConfirmDeleteAttachmentAlert } from '#/components/alerts/confirm-delete-attachment-alert'
import { ConfirmDeleteTimeEntryAlert } from '#/components/alerts/confirm-delete-time-entry-alert'
import { ConfirmDeleteTrackerProjectAlert } from '#/components/alerts/confirm-delete-tracker-project-alert'
import { AlertDialog } from '#/components/ui/alert-dialog'

export const {
  pushModal: pushAlert,
  popModal: popAlert,
  ModalProvider: AlertProvider,
} = createPushModal({
  modals: {
    confirmDeleteTrackerProject: {
      Component: ConfirmDeleteTrackerProjectAlert,
      Wrapper: (props) => <AlertDialog {...props} />,
    },
    confirmDeleteTimeEntry: {
      Component: ConfirmDeleteTimeEntryAlert,
      Wrapper: (props) => <AlertDialog {...props} />,
    },
    confirmDeleteAttachment: {
      Component: ConfirmDeleteAttachmentAlert,
      Wrapper: (props) => <AlertDialog {...props} />,
    },
  },
})
