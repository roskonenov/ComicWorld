import { useState } from "react";

export default function usePersistedState(keyWord, initialValue) {
    const [state, setState] = useState(() => {
        const persistedState = localStorage.getItem(keyWord);
        if (persistedState === 'undefined' || !persistedState) {
            return typeof initialValue === 'function'
            ? initialValue()
            : initialValue;
        }
        return JSON.parse(persistedState);
    });

    function setPersistedState(input) {
        const data = typeof input === 'function'
        ? input(state)
        : input;

        localStorage.setItem(keyWord, JSON.stringify(data));
        setState(input)
    };

    return [state, setPersistedState];
}