/**
 * react-hook-form@7.76.0 的打包缺陷临时补丁。
 *
 * 该版本的 dist/index.d.ts 全部 re-export 自 '../src/*',而 npm 包内并未发布 src/ 目录,
 * 导致 TS 报 "Module 'react-hook-form' has no exported member 'useForm'"。
 * 运行时完全正常(dist/index.esm.mjs 正确导出 useForm)。
 *
 * 这里用官方 d.ts 里实际使用的签名做最小声明,只覆盖本项目用到的 API。
 * 待升级到修复该缺陷的版本后,请删除本文件。
 */
declare module "react-hook-form" {
  export type FieldValues = Record<string, unknown>
  export type UseFormReturn<TFieldValues extends FieldValues = FieldValues> = {
    register: (name: string) => Record<string, unknown>
    handleSubmit: (
      onValid: (data: TFieldValues) => void | Promise<void>
    ) => (e?: { preventDefault: () => void }) => Promise<void>
    formState: { errors: Record<string, { message?: string }> }
    reset: () => void
    watch: (name?: string) => unknown
    setValue: (name: string, value: unknown) => void
    getValues: () => TFieldValues
  }
  export type UseFormProps<TFieldValues extends FieldValues = FieldValues> = {
    resolver?: unknown
    defaultValues?: Partial<TFieldValues>
    mode?: string
  }
  export function useForm<TFieldValues extends FieldValues = FieldValues>(
    props?: UseFormProps<TFieldValues>
  ): UseFormReturn<TFieldValues>
}
