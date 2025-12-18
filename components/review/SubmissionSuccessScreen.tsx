import { Check } from 'lucide-react'

interface SubmissionSuccessScreenProps {
    isApprovedState: boolean
}

export function SubmissionSuccessScreen({ isApprovedState }: SubmissionSuccessScreenProps) {
    return (
        <div className="p-8 flex items-center justify-center min-h-[calc(100vh-140px)]">
            <div className="text-center max-w-md">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
                    <Check className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {isApprovedState ? 'Characters Approved!' : 'Changes Submitted Successfully'}
                </h2>
                <p className="text-gray-600 mb-6">
                    {isApprovedState
                        ? 'Thank you for approving the characters. We will now proceed with creating the illustrations for your book.'
                        : 'Thank you for submitting your character details and manuscript updates.'}
                </p>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
                    <p className="font-semibold mb-1">What happens next?</p>
                    <p>
                        {isApprovedState
                            ? 'Our illustrators will start working on the full scene illustrations. You will be notified when the first drafts are ready.'
                            : 'Our illustrators are now creating your character illustrations based on your specifications. You will be notified once they are ready for review.'}
                    </p>
                </div>
            </div>
        </div>
    )
}
