import CreateProjectForm from './create-project-form'

export default function NewProjectPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
        <p className="text-gray-600 mt-2">
          Start a new children's book illustration project
        </p>
      </div>
      <CreateProjectForm />
    </div>
  )
}

















