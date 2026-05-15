import { createPushModal } from 'pushmodal'

import { AttachmentPreviewModal } from '#/components/inbox/attachment-preview-modal'
import { Dialog } from '#/components/ui/dialog'

export const { pushModal, popModal, ModalProvider } = createPushModal({
  modals: {
    attachmentPreview: {
      Component: AttachmentPreviewModal,
      Wrapper: (props) => <Dialog {...props} />,
    },
  },
})
