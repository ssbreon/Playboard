import { useState } from 'react'
import { PLAY_TEMPLATES } from '../utils/formations'

export function NewPlayDialog({ open, titleLabel, onCancel, onCreate }) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState(PLAY_TEMPLATES[0].id)

  if (!open) return null

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, templateId)
    setName('')
    setTemplateId(PLAY_TEMPLATES[0].id)
  }

  function handleCancel() {
    setName('')
    setTemplateId(PLAY_TEMPLATES[0].id)
    onCancel()
  }

  return (
    <div className="dialog-overlay" onClick={handleCancel}>
      <form className="dialog-panel" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{titleLabel}</h2>
        <label className="dialog-field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
        </label>
        <fieldset className="dialog-field dialog-templates">
          <legend>Template</legend>
          {PLAY_TEMPLATES.map((template) => (
            <label key={template.id} className="dialog-template-option">
              <input
                type="radio"
                name="template"
                value={template.id}
                checked={templateId === template.id}
                onChange={() => setTemplateId(template.id)}
              />
              <span>{template.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className="dialog-create">
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
