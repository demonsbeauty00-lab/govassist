import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name.").max(120),
  dob: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date of birth."),
  gender: z.enum(["Male", "Female", "Other"]),
  state: z.string().trim().min(1, "Select your state."),
  category: z.enum(["General", "OBC", "SC", "ST", "EWS"]),
  is_pwbd: z.boolean(),
  preferred_categories: z.array(z.string()).min(1, "Pick at least one exam category."),
});

export const educationSchema = z.object({
  qualification_level: z.enum(["Below 10th", "10th pass", "12th pass", "Diploma", "Graduate", "Post Graduate"]),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  passing_year: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || (/^\d{4}$/.test(v) && Number(v) >= 1950 && Number(v) <= 2100), "Enter a valid 4-digit year."),
});
