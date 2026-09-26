import { useState } from 'react'
import { PLAY_TEMPLATES } from '../utils/formations'
import { DEFAULT_THEME_ID, PLAY_THEMES } from '../utils/themes'

export const PLAY_CATEGORIES = ['Front', 'Stunt', 'Blitz', 'Coverage', 'Play Call']
export const FIELD_DECORATIONS = ['None', 'Hash Marks', 'Hash Marks and Numbers']
export const FIELD_ORIENTATIONS = ['High School', 'NCAA', 'NFL']

export function NewPlayDialog({ open, titleLabel, onCancel, onCreate }) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState(PLAY_TEMPLATES[0].id)
  const [category, setCategory] = useState(PLAY_CATEGORIES[0])
  const [fieldDecoration, setFieldDecoration] = useState(FIELD_DECORATIONS[0])
  const [fieldOrientation, setFieldOrientation] = useState(FIELD_ORIENTATIONS[0])
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID)

  if (!open) return null

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, templateId, themeId, category, fieldDecoration, fieldOrientation)
    setName('')
    setTemplateId(PLAY_TEMPLATES[0].id)
    setCategory(PLAY_CATEGORIES[0])
    setFieldDecoration(FIELD_DECORATIONS[0])
    setFieldOrientation(FIELD_ORIENTATIONS[0])
    setThemeId(DEFAULT_THEME_ID)
  }

  function handleCancel() {
    setName('')
    setTemplateId(PLAY_TEMPLATES[0].id)
    setCategory(PLAY_CATEGORIES[0])
    setFieldDecoration(FIELD_DECORATIONS[0])
    setFieldOrientation(FIELD_ORIENTATIONS[0])
    setThemeId(DEFAULT_THEME_ID)
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
        <label className="dialog-field">
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {PLAY_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Field Decoration</span>
          <select value={fieldDecoration} onChange={(event) => setFieldDecoration(event.target.value)}>
            {FIELD_DECORATIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Field Orientation</span>
          <select value={fieldOrientation} onChange={(event) => setFieldOrientation(event.target.value)}>
            {FIELD_ORIENTATIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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
        <label className="dialog-field">
          <span>Theme</span>
          <select value={themeId} onChange={(event) => setThemeId(event.target.value)}>
            {PLAY_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
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
