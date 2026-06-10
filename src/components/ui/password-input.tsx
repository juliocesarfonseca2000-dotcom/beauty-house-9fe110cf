import { forwardRef, useState } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className = "", wrapperClassName = "", ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={ref}
        type={show ? "text" : "password"}
        className={`${className} pr-10`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        className="absolute inset-y-0 right-2 my-auto h-7 w-7 flex items-center justify-center text-text3 hover:text-navy rounded-md"
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        title={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </div>
  );
});
