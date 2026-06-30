"use client";

import { useMemo, useState } from "react";
import type { LeadFormValues } from "../types";

export type LeadFormConfig = {
  serviceOptions?: string[];
  budgetOptions?: string[];
  contactTimeOptions?: string[];
  showCompanyField?: boolean;
  showPhoneField?: boolean;
  leadKicker?: string;
};

export const defaultLeadFormConfig: Required<LeadFormConfig> = {
  serviceOptions: [
    "Web Development",
    "UI/UX Design",
    "App Development",
    "Digital Marketing",
    "Automation & Integrations",
    "Brand Identity",
    "Other",
  ],
  budgetOptions: ["Under $10,000", "$10,000 - $25,000", "$25,000 - $50,000", "$50,000+", "Not sure yet"],
  contactTimeOptions: ["Immediately", "Within 1 month", "1-3 months", "Flexible"],
  showCompanyField: true,
  showPhoneField: true,
  leadKicker: "Get in touch",
};

type LeadFormProps = {
  sourcePage: string;
  intent?: string;
  config?: LeadFormConfig;
  onCancel: () => void;
  onSubmit: (values: LeadFormValues) => Promise<void>;
};

export function LeadForm({ sourcePage, intent, config, onCancel, onSubmit }: LeadFormProps) {
  const resolvedConfig = useMemo(() => ({ ...defaultLeadFormConfig, ...config }), [config]);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<LeadFormValues>({
    name: "",
    email: "",
    phone: "",
    companyName: "",
    requiredService: intent === "consultation" ? "Book a Free Consultation" : intent === "contact" ? "Contact Us" : "",
    budget: "",
    projectDetails: "",
    preferredContactTime: "",
    sourcePage,
    honeypot: "",
    submittedAt: Date.now(),
  });

  const headline = useMemo(() => {
    switch (intent) {
      case "consultation":
        return "Book a Free Consultation";
      case "contact":
        return "Contact Us";
      case "support":
        return "Talk to Human Support";
      default:
        return "Get a Quote";
    }
  }, [intent]);

  function updateField<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function validateStepOne() {
    if (!formState.name.trim()) {
      return "Please enter your name.";
    }

    if (!formState.email.trim() || !/^\S+@\S+\.\S+$/.test(formState.email)) {
      return "Please enter a valid email address.";
    }

    if (resolvedConfig.showPhoneField && !formState.phone.trim()) {
      return "Please enter your phone number.";
    }

    return null;
  }

  function validateStepTwo() {
    if (resolvedConfig.showCompanyField && !formState.companyName.trim()) {
      return "Please enter your company name.";
    }

    if (!formState.requiredService.trim()) {
      return "Please select a required service.";
    }

    if (!formState.budget.trim()) {
      return "Please select a budget.";
    }

    if (!formState.preferredContactTime.trim()) {
      return "Please select a preferred contact time.";
    }

    return null;
  }

  function goNext() {
    setError(null);

    if (step === 1) {
      const validationError = validateStepOne();
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    if (step === 2) {
      const validationError = validateStepTwo();
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setStep((current) => Math.min(current + 1, 3));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!formState.projectDetails.trim()) {
      setError("Please describe your project.");
      return;
    }

    if (formState.honeypot.trim()) {
      setError("Submission rejected.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        ...formState,
        submittedAt: Date.now(),
      });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="chatbot-lead-form">
      <div className="chatbot-lead-header">
        <div>
          <p className="chatbot-lead-kicker">{resolvedConfig.leadKicker}</p>
          <h3 className="chatbot-lead-title">{headline}</h3>
        </div>
        <button type="button" onClick={onCancel} className="chatbot-link-button">
          Cancel
        </button>
      </div>

      <div className="chatbot-steps">
        {[1, 2, 3].map((item) => (
          <span key={item} className={`chatbot-step ${step >= item ? "chatbot-step-active" : ""}`}>
            Step {item}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="chatbot-field-grid">
          <Field label="Name">
            <input
              value={formState.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="chatbot-input-field"
              placeholder="Your name"
              required
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={formState.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="chatbot-input-field"
              placeholder="you@company.com"
              required
            />
          </Field>
          {resolvedConfig.showPhoneField && (
            <Field label="Phone / WhatsApp" className="chatbot-field-full">
              <input
                value={formState.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                className="chatbot-input-field"
                placeholder="+92..."
                required
              />
            </Field>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="chatbot-field-grid">
          {resolvedConfig.showCompanyField && (
            <Field label="Company name">
              <input
                value={formState.companyName}
                onChange={(event) => updateField("companyName", event.target.value)}
                className="chatbot-input-field"
                placeholder="Company or brand"
                required
              />
            </Field>
          )}
          <Field label="Required service">
            <select
              value={formState.requiredService}
              onChange={(event) => updateField("requiredService", event.target.value)}
              className="chatbot-input-field"
              required
            >
              <option value="">Select a service</option>
              {resolvedConfig.serviceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Budget">
            <select
              value={formState.budget}
              onChange={(event) => updateField("budget", event.target.value)}
              className="chatbot-input-field"
              required
            >
              <option value="">Select a budget</option>
              {resolvedConfig.budgetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preferred contact time">
            <select
              value={formState.preferredContactTime}
              onChange={(event) => updateField("preferredContactTime", event.target.value)}
              className="chatbot-input-field"
              required
            >
              <option value="">Select one</option>
              {resolvedConfig.contactTimeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="chatbot-field-stack">
          <Field label="Project details">
            <textarea
              value={formState.projectDetails}
              onChange={(event) => updateField("projectDetails", event.target.value)}
              className="chatbot-input-field chatbot-textarea"
              placeholder="Describe your project, goals, timeline, and any special requirements."
              required
            />
          </Field>
          <Field label="Source page">
            <input value={formState.sourcePage} className="chatbot-input-field" readOnly />
          </Field>
          <input
            value={formState.honeypot}
            onChange={(event) => updateField("honeypot", event.target.value)}
            className="chatbot-hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
        </div>
      )}

      {error && <p className="chatbot-error">{error}</p>}

      <div className="chatbot-lead-actions">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(current - 1, 1))}
          disabled={step === 1 || isSubmitting}
          className="chatbot-secondary-button"
        >
          Back
        </button>
        {step < 3 ? (
          <button type="button" onClick={goNext} className="chatbot-primary-button">
            Next
          </button>
        ) : (
          <button type="submit" disabled={isSubmitting} className="chatbot-primary-button">
            {isSubmitting ? "Submitting..." : "Send request"}
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`chatbot-field ${className ?? ""}`}>
      <span className="chatbot-field-label">{label}</span>
      {children}
    </label>
  );
}

export default LeadForm;
