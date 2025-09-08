import { useState, useEffect } from 'react';

interface CreateProjectModalProps {
  onCreate: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
  isCreating: boolean;
}

const CreateProjectModal = ({ onCreate, onCancel, isCreating }: CreateProjectModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Focus name input when modal opens
  useEffect(() => {
    const nameInput = document.getElementById('project-name');
    if (nameInput) {
      nameInput.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      await onCreate(name.trim(), description.trim());
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Create New Project
          </h3>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label 
                htmlFor="project-name" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Project Name *
              </label>
              <input
                type="text"
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-blue-500 focus:border-blue-500"
                placeholder="My Motion Capture Project"
                required
                disabled={isCreating}
              />
            </div>

            <div className="mb-6">
              <label 
                htmlFor="project-description" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Description
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe your motion capture project..."
                disabled={isCreating}
              />
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-secondary"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!name.trim() || isCreating}
              >
                {isCreating ? (
                  <>
                    <div className="spinner"></div>
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;