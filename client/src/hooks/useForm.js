import { useState } from "react";

export default function useForm(initialValues, callback) {
    const [formValues, setFormValues] = useState(initialValues);

    const changeHandler = (e) => {
        setFormValues({
            ...formValues,
            [e.target.name]: e.target.value,
        });
    };

    const submitHandler = (e) => {
        e.preventDefault();
        callback(formValues);
        setFormValues(initialValues);
    }


    return { formValues, changeHandler, submitHandler };
}