import { NavLink } from "react-router";
import styles from "./NavItem.module.css"

export default function NavItem({
    item
}) {
    return (
        <li className={styles['list-item']}>
            <NavLink
                className={styles.link}
                to={item.path}
                style={({ isActive }) => isActive ? { 'textShadow': '0 0 10px #ffe262, 0 0 20px #ffe262, 0 0 30px #ffe262' } : {}}
            >
                {item.name}
            </NavLink>
        </li>
    );
}